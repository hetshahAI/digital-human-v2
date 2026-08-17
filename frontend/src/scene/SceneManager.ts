import * as THREE from 'three';
import Stats from 'stats.js';
import { setupRenderer } from '../renderer/rendererSetup';
import { setupLighting } from '../lighting/lightingSetup';
import { setupControls } from '../controls/controlsSetup';
import { CinematicCameraEngine } from '../camera/cameraSetup';
import { AvatarController } from '../avatar/controllers/AvatarController';
import { CharacterController } from '../character/CharacterController';
import { PipelineClient } from '../audio/PipelineClient';

export class SceneManager {
    public scene: THREE.Scene;
    public cameraEngine: CinematicCameraEngine;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    public controls: any;
    private clock: THREE.Clock;
    private stats: Stats;
    public avatarController: AvatarController;
    public characterController: CharacterController;
    public pipelineClient: PipelineClient;

    // Visual FX & Dynamic elements
    private dustParticles: THREE.Points | null = null;
    private voicePulseMesh: THREE.Mesh | null = null;
    private holographicEmblem: THREE.Group | null = null;
    private palmLeaves: THREE.Group[] = [];

    constructor(container: HTMLElement) {
        this.scene = new THREE.Scene();
        // Warm Dubai Sunset Dusk Horizon
        this.scene.background = new THREE.Color(0x0e1322);
        this.scene.fog = new THREE.FogExp2(0x0e1322, 0.012);
        
        // Setup Cinematic Camera Engine (Frames Alicia at 35-45% screen height)
        this.cameraEngine = new CinematicCameraEngine();
        this.camera = this.cameraEngine.camera;
        (window as any).__cameraEngine = this.cameraEngine;
        (window as any).__camera = this.camera;

        this.renderer = setupRenderer(container);
        this.controls = setupControls(this.camera, this.renderer.domElement);
        (window as any).__controls = this.controls;
        setupLighting(this.scene);
        
        this.clock = new THREE.Clock();
        
        // Setup stats (FPS)
        this.stats = new Stats();
        this.stats.showPanel(0);
        document.body.appendChild(this.stats.dom);

        this.avatarController = new AvatarController(this.scene);
        this.characterController = new CharacterController(this.avatarController);
        this.characterController.setCamera(this.camera);
        this.pipelineClient = new PipelineClient(this.avatarController);
        this.pipelineClient.setCharacterController(this.characterController);

        // Bind resize event
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    public async init() {
        this.createLuxuryExecutivePenthouseSuite();

        try {
            await this.avatarController.load('/avatar.vrm');
            this.characterController.initPosition();
        } catch (error) {
            console.error(error);
            throw new Error(`Failed to load avatar. Ensure /public/avatar.vrm exists. Details: ${error}`);
        }
        
        this.animate();
    }

    /**
     * Complete UAE Luxury Executive Penthouse Suite:
     * - Seamless 44m x 44m Italian Carrara marble floor with brass inlay seams
     * - Grand Luxury Reception Desk (White Carrara & Black Marquina marble, brushed gold trim, soft LED underglow)
     * - Backlit 'ALICIA - Executive Reception • Dubai DIFC' Branding Panel
     * - Full Dubai Sunset Skyline featuring the towering, majestic Burj Khalifa
     * - Solid architectural side walls (American Walnut slats & Backlit Mashrabiya)
     * - Grand coffered ceiling with warm cove illumination
     * - Exterior terrace with 3D realistic royal palm trees
     * - Executive lounge seating & indoor architectural planters
     */
    private createLuxuryExecutivePenthouseSuite() {
        const marbleTexture = this.createCarraraMarbleTexture();

        // Standard Luxury Materials
        const goldMat = new THREE.MeshPhysicalMaterial({
            color: 0xd4af37,
            metalness: 0.98,
            roughness: 0.12, // Smoother polished gold
            clearcoat: 0.8,
            clearcoatRoughness: 0.1
        });
        const blackMarbleMat = new THREE.MeshPhysicalMaterial({
            color: 0x11141d,
            roughness: 0.15,
            metalness: 0.15,
            clearcoat: 1.0, // High gloss marble
            clearcoatRoughness: 0.05
        });
        const walnutMat = new THREE.MeshStandardMaterial({
            color: 0x3b261b,
            roughness: 0.65,
            metalness: 0.05
        });
        const titaniumMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            metalness: 0.85,
            roughness: 0.25
        });

        // =========================================================================
        // 1. EXPANSIVE SEAMLESS CARRARA MARBLE FLOOR (44m x 44m)
        // =========================================================================
        const floorGeo = new THREE.PlaneGeometry(44.0, 44.0, 64, 64);
        const floorMat = new THREE.MeshPhysicalMaterial({
            map: marbleTexture,
            roughness: 0.12,
            metalness: 0.10,
            clearcoat: 0.8, // Polished floor reflection
            clearcoatRoughness: 0.15
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.0;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Circular Executive Centerpiece Platform
        const platformGeo = new THREE.CylinderGeometry(4.4, 4.6, 0.04, 64);
        const platformMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            map: marbleTexture,
            roughness: 0.12,
            metalness: 0.08,
            clearcoat: 0.9,
            clearcoatRoughness: 0.1
        });
        const platform = new THREE.Mesh(platformGeo, platformMat);
        platform.position.y = 0.02;
        platform.receiveShadow = true;
        this.scene.add(platform);

        // Outer Brass Inlay Perimeter Ring
        const ringGeo = new THREE.RingGeometry(4.35, 4.45, 64);
        const ring = new THREE.Mesh(ringGeo, goldMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.041;
        this.scene.add(ring);

        // =========================================================================
        // 2. AUDIO VISUALIZATION: SOFT GOLDEN CIRCULAR VOICE ENERGY PULSE
        // =========================================================================
        const pulseGeo = new THREE.RingGeometry(0.70, 1.05, 64);
        const pulseMat = new THREE.MeshBasicMaterial({
            color: 0xd4af37,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.voicePulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        this.voicePulseMesh.rotation.x = -Math.PI / 2;
        this.voicePulseMesh.position.set(-0.85, 0.043, -0.95); // Centered directly beneath Alicia
        this.scene.add(this.voicePulseMesh);

        // =========================================================================
        // 3. SLEEK EXECUTIVE RECEPTION DESK (WHITE CARRARA & BLACK MARQUINA MARBLE)
        // =========================================================================
        const deskGroup = new THREE.Group();
        deskGroup.position.set(-0.85, 0, -0.28); // Positioned comfortably in front of Alicia

        // A. White Carrara Marble Countertop (Waterfall Edge, Y = 0.80m)
        const deskTopGeo = new THREE.BoxGeometry(2.60, 0.08, 0.70);
        const deskTopMat = new THREE.MeshPhysicalMaterial({
            map: marbleTexture,
            color: 0xffffff,
            roughness: 0.10, // Glassy desk surface
            metalness: 0.05,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05
        });
        const deskTop = new THREE.Mesh(deskTopGeo, deskTopMat);
        deskTop.position.set(0, 0.80, 0);
        deskTop.castShadow = true;
        deskTop.receiveShadow = true;
        deskGroup.add(deskTop);

        // B. Black Marquina Marble Accent Tier
        const blackTierGeo = new THREE.BoxGeometry(2.54, 0.06, 0.66);
        const blackTier = new THREE.Mesh(blackTierGeo, blackMarbleMat);
        blackTier.position.set(0, 0.73, 0);
        blackTier.castShadow = true;
        deskGroup.add(blackTier);

        // C. Walnut & Brushed Brass Fluted Front Body
        const deskBodyGeo = new THREE.BoxGeometry(2.48, 0.65, 0.62);
        const deskBody = new THREE.Mesh(deskBodyGeo, walnutMat);
        deskBody.position.set(0, 0.38, 0);
        deskBody.castShadow = true;
        deskGroup.add(deskBody);

        // D. Brushed Gold Trim Band
        const goldBandGeo = new THREE.BoxGeometry(2.50, 0.04, 0.64);
        const goldBand = new THREE.Mesh(goldBandGeo, goldMat);
        goldBand.position.set(0, 0.40, 0);
        deskGroup.add(goldBand);

        // E. Brass Toe Kick Base
        const deskBaseGeo = new THREE.BoxGeometry(2.44, 0.05, 0.58);
        const deskBase = new THREE.Mesh(deskBaseGeo, goldMat);
        deskBase.position.set(0, 0.025, 0);
        deskGroup.add(deskBase);

        // Soft LED Underglow Strip
        const underglowGeo = new THREE.PlaneGeometry(2.40, 0.56);
        const underglowMat = new THREE.MeshBasicMaterial({
            color: 0xfef08a,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide
        });
        const underglow = new THREE.Mesh(underglowGeo, underglowMat);
        underglow.rotation.x = -Math.PI / 2;
        underglow.position.set(0, 0.01, 0);
        deskGroup.add(underglow);

        this.scene.add(deskGroup);

        // =========================================================================
        // 5. ARCHITECTURAL ROOM ENCLOSURE (WALLS & CEILING)
        // =========================================================================
        const wallHeight = 6.2;
        const roomDepth = 18.0;
        const roomWidth = 18.0;

        // --- LEFT ARCHITECTURAL WALL (X = -9.0m) ---
        const leftWallGroup = new THREE.Group();
        leftWallGroup.position.set(-roomWidth / 2, 0, 3.0);

        const leftSolid = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallHeight, roomDepth), new THREE.MeshStandardMaterial({
            color: 0x111827,
            roughness: 0.8
        }));
        leftSolid.position.y = wallHeight / 2;
        leftWallGroup.add(leftSolid);

        // Fluted American Walnut Slats & Gold Fins
        for (let z = -roomDepth / 2 + 0.3; z <= roomDepth / 2 - 0.3; z += 0.22) {
            const slat = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallHeight, 0.14), walnutMat);
            slat.position.set(0.18, wallHeight / 2, z);
            slat.castShadow = true;
            leftWallGroup.add(slat);

            if (Math.abs(z % 0.66) < 0.11) {
                const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallHeight, 0.02), goldMat);
                fin.position.set(0.24, wallHeight / 2, z + 0.08);
                leftWallGroup.add(fin);
            }
        }
        this.scene.add(leftWallGroup);

        // --- RIGHT ARCHITECTURAL WALL (X = +9.0m) ---
        const rightWallGroup = new THREE.Group();
        rightWallGroup.position.set(roomWidth / 2, 0, 3.0);

        const rightSolid = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallHeight, roomDepth), new THREE.MeshStandardMaterial({
            color: 0x111827,
            roughness: 0.8
        }));
        rightSolid.position.y = wallHeight / 2;
        rightWallGroup.add(rightSolid);

        const mashrabiyaTexture = this.createMashrabiyaTexture();
        const mashrabiyaMat = new THREE.MeshStandardMaterial({
            map: mashrabiyaTexture,
            transparent: true,
            roughness: 0.3,
            metalness: 0.8,
            color: 0xd4af37,
            side: THREE.DoubleSide
        });

        for (let z = -roomDepth / 2 + 2.5; z <= roomDepth / 2 - 2.5; z += 4.5) {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallHeight - 1.2, 3.8), titaniumMat);
            frame.position.set(-0.12, wallHeight / 2, z);
            rightWallGroup.add(frame);

            const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.6, wallHeight - 1.4), mashrabiyaMat);
            screen.rotation.y = -Math.PI / 2;
            screen.position.set(-0.2, wallHeight / 2, z);
            rightWallGroup.add(screen);

            const glowBox = new THREE.Mesh(new THREE.PlaneGeometry(3.5, wallHeight - 1.5), new THREE.MeshBasicMaterial({
                color: 0xf59e0b,
                transparent: true,
                opacity: 0.22,
                side: THREE.DoubleSide
            }));
            glowBox.rotation.y = -Math.PI / 2;
            glowBox.position.set(-0.16, wallHeight / 2, z);
            rightWallGroup.add(glowBox);
        }
        this.scene.add(rightWallGroup);

        // --- BACK ENTRANCE WALL (Z = +12.0m) ---
        const backWallGroup = new THREE.Group();
        backWallGroup.position.set(0, wallHeight / 2, 12.0);
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(roomWidth + 0.6, wallHeight, 0.3), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 }));
        backWallGroup.add(backWall);
        this.scene.add(backWallGroup);

        // --- GRAND COFFERED CEILING (Y = 6.0m) ---
        const ceilingGroup = new THREE.Group();
        ceilingGroup.position.set(0, wallHeight, 3.0);
        const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 }));
        ceiling.rotation.x = Math.PI / 2;
        ceilingGroup.add(ceiling);
        this.scene.add(ceilingGroup);

        // =========================================================================
        // 6. GRAND FLOOR-TO-CEILING CURTAIN WALL (Z = -6.0m)
        // =========================================================================
        const windowZ = -6.0;
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.08,
            roughness: 0.02,
            metalness: 0.05,
            transmission: 0.94,
            ior: 1.5,
            side: THREE.DoubleSide
        });
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, wallHeight), glassMat);
        glass.position.set(0, wallHeight / 2, windowZ);
        this.scene.add(glass);

        // Window Titanium & Gold Mullions
        for (let x = -roomWidth / 2 + 2.25; x < roomWidth / 2; x += 3.0) {
            const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallHeight, 0.14), titaniumMat);
            vMullion.position.set(x, wallHeight / 2, windowZ + 0.02);
            this.scene.add(vMullion);
        }
        for (let y = 1.6; y < wallHeight; y += 1.8) {
            const hMullion = new THREE.Mesh(new THREE.BoxGeometry(roomWidth, 0.08, 0.14), titaniumMat);
            hMullion.position.set(0, y, windowZ + 0.02);
            this.scene.add(hMullion);
        }

        // =========================================================================
        // 7. GRAND DUBAI SUNSET SKYLINE WITH FULL TOWERING BURJ KHALIFA
        // =========================================================================
        const skylineTexture = this.createDubaiSkylineTexture();
        const skylineGeo = new THREE.PlaneGeometry(54.0, 22.0);
        const skylineMat = new THREE.MeshBasicMaterial({
            map: skylineTexture,
            side: THREE.DoubleSide,
            fog: false
        });
        const skyline = new THREE.Mesh(skylineGeo, skylineMat);
        skyline.position.set(0, 8.5, -9.2);
        this.scene.add(skyline);

        // =========================================================================
        // 8. EXTERIOR TERRACE & 3D REALISTIC ROYAL PALM TREES
        // =========================================================================
        const terrace = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth + 8.0, 8.0), new THREE.MeshStandardMaterial({ color: 0x182030, roughness: 0.6 }));
        terrace.rotation.x = -Math.PI / 2;
        terrace.position.set(0, -0.01, windowZ - 4.0);
        this.scene.add(terrace);

        this.createRealisticPalmTree(-5.2, 0.0, windowZ - 2.5);
        this.createRealisticPalmTree(5.2, 0.0, windowZ - 2.5);
        this.createRealisticPalmTree(-8.5, 0.0, windowZ - 3.8);
        this.createRealisticPalmTree(8.5, 0.0, windowZ - 3.8);

        // =========================================================================
        // 9. EXECUTIVE LOUNGE & INDOOR ARCHITECTURAL PLANTERS
        // =========================================================================
        this.createArchitecturalPlanter(-4.8, 0, 1.2);
        this.createArchitecturalPlanter(4.8, 0, 1.2);
        this.createExecutiveLounge(-5.6, 0, -0.8);

        // Floating Holographic Dubai Future Pedestal (Right Side)
        this.holographicEmblem = this.createHolographicPedestal(4.6, 0, -1.8);
        this.scene.add(this.holographicEmblem);

        // =========================================================================
        // 10. FLOATING GOLDEN SUNSET DUST MOTES (PARTICLES)
        // =========================================================================
        this.createGoldenDustParticles();
    }

    // -------------------------------------------------------------------------
    // PROCEDURAL ASSET GENERATORS
    // -------------------------------------------------------------------------

    private createCarraraMarbleTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 1024, 1024);

        ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
        ctx.lineWidth = 4;
        ctx.filter = 'blur(6px)';

        for (let i = 0; i < 7; i++) {
            ctx.beginPath();
            let x = Math.random() * 1024;
            let y = 0;
            ctx.moveTo(x, y);
            while (y < 1024) {
                x += (Math.random() - 0.5) * 140;
                y += Math.random() * 160 + 60;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        ctx.filter = 'blur(2px)';
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            let x = Math.random() * 1024;
            let y = 0;
            ctx.moveTo(x, y);
            while (y < 1024) {
                x += (Math.random() - 0.48) * 180;
                y += Math.random() * 200 + 80;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        ctx.filter = 'none';
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.75)';
        ctx.lineWidth = 3;
        for (let p = 0; p <= 1024; p += 256) {
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, 1024);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, p);
            ctx.lineTo(1024, p);
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(10, 10);
        return tex;
    }

    private createDubaiSkylineTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;

        // 1. Warm Dubai Sunset Sky Gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, 1024);
        skyGrad.addColorStop(0.0, '#090d18'); // Deep Twilight
        skyGrad.addColorStop(0.25, '#1e1b4b'); // Royal Violet
        skyGrad.addColorStop(0.48, '#6b21a8'); // Sunset Dusk
        skyGrad.addColorStop(0.65, '#be123c'); // Rose Sunset
        skyGrad.addColorStop(0.80, '#ea580c'); // Warm Amber
        skyGrad.addColorStop(0.92, '#f59e0b'); // Golden Horizon
        skyGrad.addColorStop(1.0, '#fef08a');  // Radiant Baseline
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, 2048, 1024);

        // Radiant Sunset Glow Sphere at Horizon
        const sunGlow = ctx.createRadialGradient(1350, 700, 30, 1350, 700, 680);
        sunGlow.addColorStop(0.0, 'rgba(254, 240, 138, 0.95)');
        sunGlow.addColorStop(0.35, 'rgba(251, 146, 60, 0.65)');
        sunGlow.addColorStop(1.0, 'rgba(251, 146, 60, 0.0)');
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(1350, 700, 680, 0, Math.PI * 2);
        ctx.fill();

        // 2. Dubai Skyline Silhouette Towers
        const drawSkyscraper = (x: number, width: number, height: number, crownType: 'flat' | 'spire' | 'sloped' | 'curved') => {
            const base = 820;
            const topY = base - height;
            ctx.fillStyle = '#060911';
            ctx.beginPath();
            ctx.moveTo(x, base);
            ctx.lineTo(x, topY);
            if (crownType === 'spire') {
                ctx.lineTo(x + width / 2, topY - 70);
                ctx.lineTo(x + width, topY);
            } else if (crownType === 'sloped') {
                ctx.lineTo(x + width, topY + 35);
            } else if (crownType === 'curved') {
                ctx.quadraticCurveTo(x + width / 2, topY - 40, x + width, topY);
            } else {
                ctx.lineTo(x + width, topY);
            }
            ctx.lineTo(x + width, base);
            ctx.closePath();
            ctx.fill();

            // Window illumination grids
            ctx.fillStyle = 'rgba(254, 240, 138, 0.40)';
            for (let wy = topY + 30; wy < base - 20; wy += 20) {
                for (let wx = x + 8; wx < x + width - 8; wx += 12) {
                    if (Math.random() > 0.35) {
                        ctx.fillRect(wx, wy, 5, 8);
                    }
                }
            }
        };

        // Left Side Downtown Clusters
        drawSkyscraper(80, 110, 320, 'flat');
        drawSkyscraper(210, 140, 460, 'sloped');
        drawSkyscraper(370, 160, 420, 'spire');
        drawSkyscraper(550, 130, 380, 'curved');
        drawSkyscraper(700, 150, 490, 'flat');
        drawSkyscraper(870, 170, 430, 'spire');

        // =====================================================================
        // MAJESTIC FULL BURJ KHALIFA (Framed prominently in background)
        // Towering from base at Y=820 all the way to Y=90 (730px tall!)
        // =====================================================================
        const bx = 1280;
        const bBase = 820;

        ctx.fillStyle = '#05070d';
        ctx.beginPath();
        ctx.moveTo(bx - 95, bBase);
        // Step 1
        ctx.lineTo(bx - 80, bBase - 180);
        ctx.lineTo(bx - 65, bBase - 180);
        // Step 2
        ctx.lineTo(bx - 55, bBase - 320);
        ctx.lineTo(bx - 44, bBase - 320);
        // Step 3
        ctx.lineTo(bx - 35, bBase - 460);
        ctx.lineTo(bx - 26, bBase - 460);
        // Step 4
        ctx.lineTo(bx - 18, bBase - 580);
        ctx.lineTo(bx - 10, bBase - 580);
        // Central Spire Pinnacle
        ctx.lineTo(bx - 3, bBase - 700);
        ctx.lineTo(bx, bBase - 730); // Spire Tip
        ctx.lineTo(bx + 3, bBase - 700);
        // Right Side Stepping
        ctx.lineTo(bx + 10, bBase - 580);
        ctx.lineTo(bx + 18, bBase - 580);
        ctx.lineTo(bx + 26, bBase - 460);
        ctx.lineTo(bx + 35, bBase - 460);
        ctx.lineTo(bx + 44, bBase - 320);
        ctx.lineTo(bx + 55, bBase - 320);
        ctx.lineTo(bx + 65, bBase - 180);
        ctx.lineTo(bx + 80, bBase - 180);
        ctx.lineTo(bx + 95, bBase);
        ctx.closePath();
        ctx.fill();

        // Architectural Terrace Lighting
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
        ctx.lineWidth = 2;
        const drawTerraceLight = (y: number, w: number) => {
            ctx.beginPath();
            ctx.moveTo(bx - w, y);
            ctx.lineTo(bx + w, y);
            ctx.stroke();
        };
        drawTerraceLight(bBase - 180, 65);
        drawTerraceLight(bBase - 320, 44);
        drawTerraceLight(bBase - 460, 26);
        drawTerraceLight(bBase - 580, 10);

        // Vertical Cyan Accent LED Spine
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.90)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, bBase);
        ctx.lineTo(bx, bBase - 700);
        ctx.stroke();

        // Pulsing Aviation Beacon at Pinnacle Tip
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(bx, bBase - 730, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(bx, bBase - 730, 2, 0, Math.PI * 2);
        ctx.fill();

        // Right Side Skyline Towers
        drawSkyscraper(1460, 130, 460, 'sloped');
        drawSkyscraper(1610, 160, 520, 'spire');
        drawSkyscraper(1790, 140, 390, 'flat');
        drawSkyscraper(1940, 100, 340, 'curved');

        // Horizon Ground Base
        ctx.fillStyle = '#04060a';
        ctx.fillRect(0, 820, 2048, 204);

        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    private createMashrabiyaTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;

        ctx.clearRect(0, 0, 512, 512);
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 6;

        const drawStar8 = (cx: number, cy: number, r: number) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.beginPath();
            ctx.rect(-r, -r, r * 2, r * 2);
            ctx.stroke();

            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.rect(-r, -r, r * 2, r * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        };

        for (let x = 64; x < 512; x += 128) {
            for (let y = 64; y < 512; y += 128) {
                drawStar8(x, y, 42);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 4);
        return tex;
    }

    private createRealisticPalmTree(x: number, y: number, z: number): void {
        const palmGroup = new THREE.Group();
        palmGroup.position.set(x, y, z);

        const trunkPoints: THREE.Vector3[] = [];
        const curveDir = x < 0 ? 0.4 : -0.4;
        trunkPoints.push(new THREE.Vector3(0, 0, 0));
        trunkPoints.push(new THREE.Vector3(curveDir * 0.3, 2.0, -0.2));
        trunkPoints.push(new THREE.Vector3(curveDir * 0.7, 4.2, -0.3));

        const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
        const trunkGeo = new THREE.TubeGeometry(trunkCurve, 20, 0.16, 12, false);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x4a3728,
            roughness: 0.85
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.castShadow = true;
        palmGroup.add(trunk);

        const crownGroup = new THREE.Group();
        crownGroup.position.copy(trunkPoints[2]);

        const frondMat = new THREE.MeshStandardMaterial({
            color: 0x1b4324,
            roughness: 0.5,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < 14; i++) {
            const angle = (i / 14) * Math.PI * 2;
            const frondPoints = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(Math.cos(angle) * 1.2, 0.3, Math.sin(angle) * 1.2),
                new THREE.Vector3(Math.cos(angle) * 2.4, -0.8, Math.sin(angle) * 2.4)
            ];
            const frondCurve = new THREE.CatmullRomCurve3(frondPoints);
            const frondGeo = new THREE.TubeGeometry(frondCurve, 12, 0.08, 6, false);
            const frondMesh = new THREE.Mesh(frondGeo, frondMat);
            crownGroup.add(frondMesh);

            const bladeGeo = new THREE.PlaneGeometry(0.35, 1.8);
            const blade = new THREE.Mesh(bladeGeo, frondMat);
            blade.position.set(Math.cos(angle) * 1.2, 0.0, Math.sin(angle) * 1.2);
            blade.rotation.y = angle;
            blade.rotation.x = 0.4;
            crownGroup.add(blade);
        }

        palmGroup.add(crownGroup);
        this.palmLeaves.push(crownGroup);
        this.scene.add(palmGroup);
    }

    private createArchitecturalPlanter(x: number, y: number, z: number): void {
        const planterGroup = new THREE.Group();
        planterGroup.position.set(x, y, z);

        const potMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.92,
            roughness: 0.22
        });
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.95, 32), potMat);
        pot.position.y = 0.475;
        pot.castShadow = true;
        planterGroup.add(pot);

        const leafMat = new THREE.MeshStandardMaterial({
            color: 0x166534,
            roughness: 0.35,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < 14; i++) {
            const angle = (i / 14) * Math.PI * 2;
            const elevation = 0.95 + Math.random() * 0.6;
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), leafMat);
            leaf.scale.set(0.6, 1.5, 0.15);
            leaf.position.set(Math.cos(angle) * 0.25, elevation, Math.sin(angle) * 0.25);
            leaf.rotation.x = 0.45;
            leaf.rotation.y = angle;
            leaf.castShadow = true;
            planterGroup.add(leaf);
        }

        this.scene.add(planterGroup);
    }

    private createExecutiveLounge(x: number, y: number, z: number): void {
        const loungeGroup = new THREE.Group();
        loungeGroup.position.set(x, y, z);

        const marbleMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.15 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.2 });

        const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 32), marbleMat);
        tableTop.position.y = 0.38;
        loungeGroup.add(tableTop);

        const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.36, 32), goldMat);
        tableBase.position.y = 0.18;
        loungeGroup.add(tableBase);

        const leatherMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
        const drawArmchair = (ax: number, az: number, ry: number) => {
            const chair = new THREE.Group();
            chair.position.set(ax, 0, az);
            chair.rotation.y = ry;

            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.18, 0.75), leatherMat);
            seat.position.y = 0.35;
            chair.add(seat);

            const back = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.14), leatherMat);
            back.position.set(0, 0.65, -0.32);
            chair.add(back);

            for (const lx of [-0.32, 0.32]) {
                for (const lz of [-0.32, 0.32]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.35, 12), goldMat);
                    leg.position.set(lx, 0.175, lz);
                    chair.add(leg);
                }
            }
            loungeGroup.add(chair);
        };

        drawArmchair(0, -1.2, 0);
        drawArmchair(0, 1.2, Math.PI);

        this.scene.add(loungeGroup);
    }

    private createHolographicPedestal(x: number, y: number, z: number): THREE.Group {
        const pedestal = new THREE.Group();
        pedestal.position.set(x, y, z);

        const plinthMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            metalness: 0.8,
            roughness: 0.2
        });
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.95, 32), plinthMat);
        plinth.position.y = 0.475;
        plinth.castShadow = true;
        pedestal.add(plinth);

        const ringMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.95,
            roughness: 0.15
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 16, 32), ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.95;
        pedestal.add(ring);

        const emblemMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.8,
            roughness: 0.1,
            metalness: 0.5
        });
        const emblemGeo = new THREE.OctahedronGeometry(0.14, 0);
        const emblem = new THREE.Mesh(emblemGeo, emblemMat);
        emblem.position.y = 1.22;
        emblem.name = 'floating_emblem';
        pedestal.add(emblem);

        return pedestal;
    }

    private createGoldenDustParticles(): void {
        const particleCount = 250;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 16.0;
            positions[i + 1] = Math.random() * 5.0 + 0.2;
            positions[i + 2] = (Math.random() - 0.5) * 14.0;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xfef08a,
            size: 0.04,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending
        });

        this.dustParticles = new THREE.Points(geo, mat);
        this.scene.add(this.dustParticles);
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        this.stats.begin();
        
        const delta = Math.min(this.clock.getDelta(), 0.1);
        const time = this.clock.getElapsedTime();
        
        // Update character locomotion and world state
        this.characterController.update(delta);
        
        // Update avatar blendshapes, lookAt, and blinking
        this.avatarController.update(delta);
        
        // Update speech animation and audio pipeline
        if (this.pipelineClient) {
            this.pipelineClient.update(delta);
        }

        // Update Cinematic Camera (Breathing Lissajous & dynamic conversation dolly)
        this.cameraEngine.update(delta, this.controls);

        // 1. Animate Audio Voice Energy Pulse beneath Alicia
        if (this.voicePulseMesh && this.pipelineClient) {
            const energy = this.pipelineClient.getVoiceEnergy();
            const targetScale = 1.0 + energy * 0.85;
            const targetOpacity = 0.2 + energy * 0.65;
            
            this.voicePulseMesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1.0), delta * 8.0);
            (this.voicePulseMesh.material as THREE.MeshBasicMaterial).opacity = targetOpacity;
        }

        // 2. Animate Floating Holographic Emblem
        if (this.holographicEmblem) {
            const emblem = this.holographicEmblem.getObjectByName('floating_emblem');
            if (emblem) {
                emblem.rotation.y = time * 0.8;
                emblem.rotation.x = Math.sin(time * 0.5) * 0.2;
                emblem.position.y = 1.22 + Math.sin(time * 1.5) * 0.03;
            }
        }

        // 3. Animate Golden Dust Particles Drift
        if (this.dustParticles) {
            const positions = this.dustParticles.geometry.attributes.position.array as Float32Array;
            for (let i = 1; i < positions.length; i += 3) {
                positions[i] += delta * 0.06;
                if (positions[i] > 5.5) {
                    positions[i] = 0.2;
                }
            }
            this.dustParticles.geometry.attributes.position.needsUpdate = true;
        }

        // 4. Gentle Breeze on Palm Fronds
        this.palmLeaves.forEach((leafGroup, idx) => {
            leafGroup.rotation.y = Math.sin(time * 0.7 + idx) * 0.04;
        });
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        
        this.stats.end();
    }
}
