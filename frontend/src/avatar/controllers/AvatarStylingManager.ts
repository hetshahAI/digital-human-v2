import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export class AvatarStylingManager {
    /**
     * Applies the UAE Haute Couture Corporate Executive PBR styling to the VRM avatar:
     * - Arabic businesswoman complexion (warm golden-olive tone, sculpted cheek blush, terracotta-rose satin lip luster)
     * - Defined Arabic winged eyeliner, refined dark onyx brows, and expressive dark brown eyes with amber flecks
     * - Silky espresso wavy hair with multi-layered anisotropic sheen
     * - Tailored haute couture Deep Obsidian Navy executive blazer with gold piping, ivory pleated silk blouse & gold pendant
     * - Fitted luxury gold executive timepiece snugly wrapping the wrist, and 8-point geometric Mashrabiya brooch on lapel
     */
    public static applyExecutiveStyling(vrm: VRM, scene: THREE.Scene): void {
        const root = vrm.scene;

        // 1. High-Definition Procedural Texture Generators
        const skinTexture = AvatarStylingManager.createOliveSkinTexture();
        const faceSkinTexture = AvatarStylingManager.createFaceSkinTexture();
        const eyeIrisTexture = AvatarStylingManager.createBrownIrisTexture();
        const hairTexture = AvatarStylingManager.createSilkyHairTexture();
        const hauteCoutureBlazerTexture = AvatarStylingManager.createHauteCoutureBlazerTexture();

        // 2. Traverse and upgrade all VRM materials to PBR Physical Materials
        root.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.Mesh && obj.material) {
                const materials = Array.isArray(obj.material) ? obj.material : [obj.material];

                materials.forEach((mat: THREE.Material, matIndex: number) => {
                    const matName = mat.name || '';
                    const upgradedMat = AvatarStylingManager.createPBRMaterialForSlot(
                        matName,
                        mat,
                        {
                            skinTexture,
                            faceSkinTexture,
                            eyeIrisTexture,
                            hairTexture,
                            hauteCoutureBlazerTexture
                        }
                    );

                    if (upgradedMat) {
                        if (Array.isArray(obj.material)) {
                            obj.material[matIndex] = upgradedMat;
                        } else {
                            obj.material = upgradedMat;
                        }
                    }
                });

                obj.castShadow = true;
                obj.receiveShadow = true;
            }
        });

        // 3. Attach 3D Executive Gold Accessories (Snug Lapel Brooch & Fitted Watch)
        AvatarStylingManager.attachExecutiveAccessories(vrm, scene);
    }

    private static createPBRMaterialForSlot(
        matName: string,
        _oldMat: any,
        textures: any
    ): THREE.Material | null {
        const nameLower = matName.toLowerCase();

        // A. FACIAL SKIN (Arabic Businesswoman Complexion with Subsurface Peach Glow)
        if (nameLower.includes('face_00_skin') || nameLower.includes('faceskin')) {
            // Enterprise Visual Polish: Upgraded to MeshPhysicalMaterial to emulate Subsurface Scattering
            return new THREE.MeshPhysicalMaterial({
                name: matName,
                map: textures.faceSkinTexture,
                color: new THREE.Color(0xffffff),
                roughness: 0.35, // Slightly softer skin
                metalness: 0.05,
                clearcoat: 0.25, // Emulates subtle oily/moist sheen of natural skin
                clearcoatRoughness: 0.45, // Softens the reflection so it doesn't look like plastic
                bumpScale: 0.002
            });
        }

        // B. BODY SKIN (Neck, Arms, Hands)
        if (nameLower.includes('body_00_skin') || nameLower.includes('bodyskin') || nameLower.includes('skin')) {
            return new THREE.MeshPhysicalMaterial({
                name: matName,
                map: textures.skinTexture,
                color: new THREE.Color(0xffffff),
                roughness: 0.38,
                metalness: 0.02,
                clearcoat: 0.15,
                clearcoatRoughness: 0.50
            });
        }

        // C. EYE IRIS (Deep Expressive Dark Brown with Amber Depths & Gold Flecks)
        if (nameLower.includes('eyeiris') || nameLower.includes('iris')) {
            // Enterprise Visual Polish: Physical transmission for depth, high clearcoat for corneal reflections
            return new THREE.MeshPhysicalMaterial({
                name: matName,
                map: textures.eyeIrisTexture,
                color: new THREE.Color(0xffffff),
                roughness: 0.05, // Wet look
                metalness: 0.0,
                clearcoat: 1.0, // High reflection
                clearcoatRoughness: 0.02, // Crisp catchlights
                ior: 1.376, // Realistic IOR for the cornea
                transmission: 0.1 // Slight depth
            });
        }

        // D. EYE HIGHLIGHT & SCLERA
        if (nameLower.includes('eyehighlight')) {
            // Softened the highlight clipping to avoid cheap glowing effect
            return new THREE.MeshBasicMaterial({
                name: matName,
                color: new THREE.Color(0xffffff),
                transparent: true,
                opacity: 0.45,
                blending: THREE.AdditiveBlending
            });
        }
        if (nameLower.includes('eyewhite')) {
            // Highly moist realistic sclera
            return new THREE.MeshPhysicalMaterial({
                name: matName,
                color: new THREE.Color(0xf9f9fa), // Off-white for realism
                roughness: 0.05, // Moist membrane
                metalness: 0.0,
                clearcoat: 1.0,
                clearcoatRoughness: 0.05,
                ior: 1.376
            });
        }

        // E. EYELINER & EYEBROWS (Deep Onyx Arabic Winged Eyeliner)
        if (nameLower.includes('faceeyeline') || nameLower.includes('facebrow')) {
            return new THREE.MeshStandardMaterial({
                name: matName,
                color: new THREE.Color(0x120c08),
                roughness: 0.65,
                metalness: 0.0,
                transparent: true,
                opacity: 0.98
            });
        }

        // F. INNER MOUTH & TEETH
        if (nameLower.includes('facemouth') || nameLower.includes('mouth')) {
            return new THREE.MeshStandardMaterial({
                name: matName,
                color: new THREE.Color(0x993d4a),
                roughness: 0.35,
                metalness: 0.05
            });
        }

        // G. SILKY ESPRESSO HAIR (Rich Dark Brunette with Anisotropic Sheen)
        if (nameLower.includes('hair')) {
            // Enterprise Polish: Physical material sheen to emulate hair softness
            return new THREE.MeshPhysicalMaterial({
                name: matName,
                map: textures.hairTexture,
                color: new THREE.Color(0x271911),
                roughness: 0.45, // Soft hair
                metalness: 0.10,
                sheen: 0.8, // Luxurious hair sheen
                sheenRoughness: 0.3,
                sheenColor: new THREE.Color(0x734832) // Warm specular reflection
            });
        }

        // H. TOPS / HAUTE COUTURE BLAZER & SILK BLOUSE (Obsidian Navy & Pure Ivory Silk)
        if (nameLower.includes('tops') || nameLower.includes('upper') || nameLower.includes('jacket') || nameLower.includes('shirt')) {
            // Upgrade to luxury fabric
            return new THREE.MeshPhysicalMaterial({
                name: matName,
                map: textures.hauteCoutureBlazerTexture,
                color: new THREE.Color(0xffffff),
                roughness: 0.65, // Fabric is rough
                metalness: 0.0,
                sheen: 0.6, // Wool/silk sheen
                sheenRoughness: 0.5,
                sheenColor: new THREE.Color(0xa3b1c6)
            });
        }

        // I. BOTTOMS / TAILORED TROUSERS (Matching Deep Obsidian Navy Wool)
        if (nameLower.includes('bottoms') || nameLower.includes('lower') || nameLower.includes('pants')) {
            return new THREE.MeshPhysicalMaterial({
                name: matName,
                color: new THREE.Color(0x0c1222),
                roughness: 0.70, // Rough wool
                metalness: 0.0,
                sheen: 0.4,
                sheenRoughness: 0.6,
                sheenColor: new THREE.Color(0x2e3b58)
            });
        }

        // J. SHOES (Luxury Executive Midnight Black)
        if (nameLower.includes('shoes')) {
            return new THREE.MeshStandardMaterial({
                name: matName,
                color: new THREE.Color(0x080b12),
                roughness: 0.25,
                metalness: 0.40
            });
        }

        return null;
    }

    // -------------------------------------------------------------
    // PROCEDURAL TEXTURE GENERATION
    // -------------------------------------------------------------

    private static createOliveSkinTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;

        // Warm golden-olive Arabic complexion base (#dfb592)
        const grad = ctx.createLinearGradient(0, 0, 0, 1024);
        grad.addColorStop(0.0, '#e5be9b');
        grad.addColorStop(0.5, '#deb08a');
        grad.addColorStop(1.0, '#d4a378');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1024, 1024);

        // Micro-porous skin texture noise
        const imgData = ctx.getImageData(0, 0, 1024, 1024);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 6;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
            data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    private static createFaceSkinTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;

        // Base warm Mediterranean/Arabian skin tone
        ctx.fillStyle = '#deb08a';
        ctx.fillRect(0, 0, 1024, 1024);

        // Sculpted cheek blush (peachy-rose glow)
        const leftCheek = ctx.createRadialGradient(380, 520, 10, 380, 520, 140);
        leftCheek.addColorStop(0.0, 'rgba(225, 115, 125, 0.32)');
        leftCheek.addColorStop(1.0, 'rgba(225, 115, 125, 0.0)');
        ctx.fillStyle = leftCheek;
        ctx.beginPath();
        ctx.arc(380, 520, 140, 0, Math.PI * 2);
        ctx.fill();

        const rightCheek = ctx.createRadialGradient(644, 520, 10, 644, 520, 140);
        rightCheek.addColorStop(0.0, 'rgba(225, 115, 125, 0.32)');
        rightCheek.addColorStop(1.0, 'rgba(225, 115, 125, 0.0)');
        ctx.fillStyle = rightCheek;
        ctx.beginPath();
        ctx.arc(644, 520, 140, 0, Math.PI * 2);
        ctx.fill();

        // Defined natural lip tone (warm terracotta rose with satin sheen)
        const lipGrad = ctx.createRadialGradient(512, 680, 15, 512, 680, 120);
        lipGrad.addColorStop(0.0, 'rgba(195, 75, 88, 0.75)');
        lipGrad.addColorStop(0.6, 'rgba(195, 75, 88, 0.45)');
        lipGrad.addColorStop(1.0, 'rgba(195, 75, 88, 0.0)');
        ctx.fillStyle = lipGrad;
        ctx.beginPath();
        ctx.ellipse(512, 680, 100, 45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Subtle center lip gloss highlight
        const gloss = ctx.createRadialGradient(512, 685, 2, 512, 685, 40);
        gloss.addColorStop(0.0, 'rgba(255, 255, 255, 0.40)');
        gloss.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        ctx.fillStyle = gloss;
        ctx.beginPath();
        ctx.ellipse(512, 685, 40, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    private static createBrownIrisTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;

        // Dark espresso outer limbal ring
        ctx.fillStyle = '#180e06';
        ctx.beginPath();
        ctx.arc(256, 256, 240, 0, Math.PI * 2);
        ctx.fill();

        // Rich dark brown iris base
        const irisGrad = ctx.createRadialGradient(256, 256, 45, 256, 256, 230);
        irisGrad.addColorStop(0.0, '#5a3014');
        irisGrad.addColorStop(0.4, '#421f0a');
        irisGrad.addColorStop(0.8, '#281306');
        irisGrad.addColorStop(1.0, '#140903');
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.arc(256, 256, 230, 0, Math.PI * 2);
        ctx.fill();

        // Radial striae / iris fibers
        ctx.strokeStyle = 'rgba(135, 70, 25, 0.40)';
        ctx.lineWidth = 2;
        for (let a = 0; a < Math.PI * 2; a += 0.08) {
            ctx.beginPath();
            ctx.moveTo(256 + Math.cos(a) * 70, 256 + Math.sin(a) * 70);
            ctx.lineTo(256 + Math.cos(a) * 210, 256 + Math.sin(a) * 210);
            ctx.stroke();
        }

        // Golden amber inner flecks
        ctx.strokeStyle = 'rgba(230, 155, 60, 0.55)';
        ctx.lineWidth = 1.5;
        for (let a = 0; a < Math.PI * 2; a += 0.14) {
            ctx.beginPath();
            ctx.moveTo(256 + Math.cos(a) * 80, 256 + Math.sin(a) * 80);
            ctx.lineTo(256 + Math.cos(a) * 145, 256 + Math.sin(a) * 145);
            ctx.stroke();
        }

        // Deep central pupil
        ctx.fillStyle = '#050201';
        ctx.beginPath();
        ctx.arc(256, 256, 68, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    private static createSilkyHairTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;

        // Dark espresso / chocolate base
        ctx.fillStyle = '#1a1008';
        ctx.fillRect(0, 0, 512, 1024);

        // Vertical silky hair strands with rich chestnut anisotropic highlights
        for (let x = 0; x < 512; x += 3) {
            const alpha = 0.18 + Math.random() * 0.28;
            const isHighlight = Math.random() > 0.60;
            ctx.strokeStyle = isHighlight ? `rgba(110, 65, 35, ${alpha})` : `rgba(18, 12, 7, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + (Math.random() - 0.5) * 8, 1024);
            ctx.stroke();
        }

        // Horizontal anisotropic specular shine band
        const sheen = ctx.createLinearGradient(0, 300, 0, 600);
        sheen.addColorStop(0.0, 'rgba(90, 55, 30, 0.0)');
        sheen.addColorStop(0.5, 'rgba(145, 90, 48, 0.35)');
        sheen.addColorStop(1.0, 'rgba(90, 55, 30, 0.0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, 512, 1024);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    /**
     * Modern Haute Couture Arabic Executive Blazer Texture (2048 x 2048)
     * Features:
     * - Deep Obsidian Navy wool twill weave
     * - Structured V-neck shawl lapels with brushed gold trim piping
     * - Ivory silk inner blouse with delicate vertical pleats
     * - Dainty gold chain necklace with 8-point Mashrabiya pendant
     * - Hand-engraved brushed gold executive buttons
     * - Tailored sleeve cuffs with gold trim piping
     */
    private static createHauteCoutureBlazerTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 2048;
        const ctx = canvas.getContext('2d')!;

        // 1. Deep Obsidian Navy Executive Base (#0c1222)
        ctx.fillStyle = '#0c1222';
        ctx.fillRect(0, 0, 2048, 2048);

        // 2. Fine Wool Twill Micro-Weave
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 2048; i += 8) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(2048, i);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 2048);
            ctx.stroke();
        }

        // 3. Pure Ivory Silk Inner Blouse Center Panel
        const blouseGrad = ctx.createLinearGradient(750, 0, 1298, 0);
        blouseGrad.addColorStop(0.0, '#ede9e3');
        blouseGrad.addColorStop(0.5, '#fcfaf7');
        blouseGrad.addColorStop(1.0, '#ede9e3');
        ctx.fillStyle = blouseGrad;
        ctx.beginPath();
        ctx.moveTo(840, 280);
        ctx.lineTo(1208, 280);
        ctx.lineTo(1130, 1180);
        ctx.lineTo(918, 1180);
        ctx.closePath();
        ctx.fill();

        // Delicate silk vertical micro-pleats
        ctx.strokeStyle = 'rgba(200, 190, 180, 0.25)';
        ctx.lineWidth = 2;
        for (let x = 880; x <= 1168; x += 24) {
            ctx.beginPath();
            ctx.moveTo(x, 280);
            ctx.lineTo(x + (x - 1024) * 0.15, 1180);
            ctx.stroke();
        }

        // 4. Dainty Gold Chain Necklace & 8-Point Star Pendant on Blouse
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(1024, 380, 90, 0.2, Math.PI - 0.2);
        ctx.stroke();

        // Pendant
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(1024, 470, 8, 0, Math.PI * 2);
        ctx.fill();

        // 5. Tailored Shawl Lapels with Brushed Gold Piping
        ctx.fillStyle = '#090e1a'; // Deep lapel face
        // Left Lapel
        ctx.beginPath();
        ctx.moveTo(760, 280);
        ctx.lineTo(870, 840);
        ctx.lineTo(1024, 1220);
        ctx.lineTo(910, 1220);
        ctx.lineTo(680, 680);
        ctx.closePath();
        ctx.fill();

        // Right Lapel
        ctx.beginPath();
        ctx.moveTo(1288, 280);
        ctx.lineTo(1178, 840);
        ctx.lineTo(1024, 1220);
        ctx.lineTo(1138, 1220);
        ctx.lineTo(1368, 680);
        ctx.closePath();
        ctx.fill();

        // Gold Piping Trim along Lapels
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 5;
        ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
        ctx.shadowBlur = 8;
        // Left Lapel Gold Edge
        ctx.beginPath();
        ctx.moveTo(760, 280);
        ctx.lineTo(870, 840);
        ctx.lineTo(1024, 1220);
        ctx.stroke();

        // Right Lapel Gold Edge
        ctx.beginPath();
        ctx.moveTo(1288, 280);
        ctx.lineTo(1178, 840);
        ctx.lineTo(1024, 1220);
        ctx.stroke();

        ctx.shadowBlur = 0; // Reset shadow

        // 6. Hand-Engraved Brushed Gold Executive Buttons (3 on center placket)
        const drawEngravedButton = (x: number, y: number, r: number) => {
            // Gold base gradient
            const btnGrad = ctx.createRadialGradient(x - 5, y - 5, 4, x, y, r);
            btnGrad.addColorStop(0.0, '#fef08a');
            btnGrad.addColorStop(0.35, '#d4af37');
            btnGrad.addColorStop(0.75, '#b45309');
            btnGrad.addColorStop(1.0, '#78350f');
            ctx.fillStyle = btnGrad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();

            // Outer gold rim
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Inner concentric starburst
            ctx.strokeStyle = 'rgba(120, 53, 15, 0.7)';
            ctx.lineWidth = 1.5;
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
                ctx.lineTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6));
                ctx.stroke();
            }
        };

        drawEngravedButton(1024, 1300, 22);
        drawEngravedButton(1024, 1440, 22);
        drawEngravedButton(1024, 1580, 22);

        // 7. Sleeve Cuffs Gold Trim & Dual Buttons
        // Left Sleeve Cuff
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(220, 1600);
        ctx.lineTo(440, 1600);
        ctx.stroke();
        drawEngravedButton(300, 1560, 14);
        drawEngravedButton(360, 1560, 14);

        // Right Sleeve Cuff
        ctx.beginPath();
        ctx.moveTo(1608, 1600);
        ctx.lineTo(1828, 1600);
        ctx.stroke();
        drawEngravedButton(1688, 1560, 14);
        drawEngravedButton(1748, 1560, 14);

        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    // -------------------------------------------------------------
    // 3D ACCESSORIES: BROOCH & FITTED EXECUTIVE WATCH
    // -------------------------------------------------------------

    private static attachExecutiveAccessories(vrm: VRM, _scene: THREE.Scene): void {
        if (!vrm.humanoid) return;

        const chestBone = vrm.humanoid.getNormalizedBoneNode('chest');
        const leftHandBone = vrm.humanoid.getNormalizedBoneNode('leftHand');

        // 1. Emirati 8-Point Geometric Mashrabiya Gold Brooch (Left Lapel)
        if (chestBone) {
            const broochGroup = new THREE.Group();
            broochGroup.name = 'UAE_Executive_Brooch';

            const goldMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(0xd4af37),
                metalness: 0.95,
                roughness: 0.15
            });

            // Diamond 1
            const geo1 = new THREE.BoxGeometry(0.024, 0.024, 0.004);
            const mesh1 = new THREE.Mesh(geo1, goldMat);
            mesh1.rotation.z = Math.PI / 4;
            broochGroup.add(mesh1);

            // Diamond 2 (intersecting 8-point Islamic star)
            const mesh2 = new THREE.Mesh(geo1, goldMat);
            mesh2.rotation.z = 0;
            broochGroup.add(mesh2);

            // Center pearl
            const centerGeo = new THREE.SphereGeometry(0.005, 16, 16);
            const pearlMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.1,
                metalness: 0.05
            });
            const centerMesh = new THREE.Mesh(centerGeo, pearlMat);
            centerMesh.position.z = 0.003;
            broochGroup.add(centerMesh);

            // Positioned securely on left blazer lapel
            broochGroup.position.set(0.08, 0.14, 0.12);
            broochGroup.rotation.x = -0.15;
            broochGroup.rotation.y = -0.12;
            chestBone.add(broochGroup);
        }

        // 2. Luxury Fitted Gold Timepiece (Snugly Wrapping Left Wrist)
        if (leftHandBone) {
            const watchGroup = new THREE.Group();
            watchGroup.name = 'UAE_Executive_Watch';

            const goldMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(0xd4af37),
                metalness: 0.95,
                roughness: 0.18
            });

            // Milanese gold mesh strap (Snug diameter 0.042m)
            const strapGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.010, 24, 1, true);
            const strapMesh = new THREE.Mesh(strapGeo, goldMat);
            strapMesh.rotation.z = Math.PI / 2;
            watchGroup.add(strapMesh);

            // Slim luxury watch bezel & case
            const caseGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.004, 24);
            const caseMesh = new THREE.Mesh(caseGeo, goldMat);
            caseMesh.position.set(0, 0.023, 0);
            watchGroup.add(caseMesh);

            // Mother-of-pearl dial
            const dialGeo = new THREE.CircleGeometry(0.009, 24);
            const dialMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.15,
                metalness: 0.05
            });
            const dialMesh = new THREE.Mesh(dialGeo, dialMat);
            dialMesh.rotation.x = -Math.PI / 2;
            dialMesh.position.set(0, 0.0255, 0);
            watchGroup.add(dialMesh);

            // Tiny Gold Watch Hands
            const handGeo = new THREE.BoxGeometry(0.001, 0.006, 0.001);
            const handMesh = new THREE.Mesh(handGeo, goldMat);
            handMesh.position.set(0, 0.026, 0.002);
            handMesh.rotation.y = 0.5;
            watchGroup.add(handMesh);

            // Positioned snugly right on the wrist joint of leftHand
            watchGroup.position.set(0.01, 0.005, 0.0);
            watchGroup.rotation.y = 0.2;
            leftHandBone.add(watchGroup);
        }
    }
}
