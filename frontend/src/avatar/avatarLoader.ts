import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';

export async function loadAvatar(url: string, scene: THREE.Scene): Promise<VRM> {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        
        // Install VRM plugin
        loader.register((parser: any) => {
            return new VRMLoaderPlugin(parser) as any;
        });

        loader.load(
            url,
            (gltf: GLTF) => {
                const vrm = gltf.userData.vrm as VRM;
                
                if (!vrm) {
                    reject(new Error("File is not a valid VRM"));
                    return;
                }

                // Call VRMUtils configuration
                VRMUtils.removeUnnecessaryVertices(gltf.scene);
                VRMUtils.removeUnnecessaryJoints(gltf.scene);
                
                // Add shadows and adjustments
                gltf.scene.traverse((obj: THREE.Object3D) => {
                    obj.frustumCulled = false;
                    if (obj instanceof THREE.Mesh) {
                        obj.castShadow = true;
                        obj.receiveShadow = true;
                    }
                });
                
                // Make avatar face camera
                vrm.scene.rotation.y = Math.PI;

                scene.add(vrm.scene);
                
                resolve(vrm);
            },
            (progress: ProgressEvent) => {
                console.log(`Loading VRM: ${100.0 * (progress.loaded / progress.total)}%`);
            },
            (error: unknown) => {
                reject(error);
            }
        );
    });
}
