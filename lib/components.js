import { OrbitControls } from './addons/OrbitControls.js';
import * as THREE from './three.module.js';

// making hyperlinks
AFRAME.registerComponent('navigate-on-click', {
    schema: {
        url: {default: ''}
    },

    init: function () {
        const data = this.data;
        const el = this.el;

        el.addEventListener('click', function () {
            window.location.href = data.url;
        });
    }
});

// adding event listener to box
AFRAME.registerComponent('dynamic-text', {

    init: function () {

        const el = this.el;

        const thisElement = document.querySelector('.dynamic-text');

        el.addEventListener('click', function () {

            //loadJSON('./json/franceschino.json', function (data) {

            //    thisElement.setAttribute('value', data.events["ev1"].description);

            //});

            thisElement.setAttribute('value', el.id);

        });
    }
});

// adding zoom event listener to component
AFRAME.registerComponent('scroll-to-zoom', {

    init: function () {

        const el = this.el;
        let zoom = 1;
        const minZoom = 0.01;
        const maxZoom = 5;

        function handleZoomLevel (delta) {
            zoom += delta;
            zoom = Math.max(minZoom, Math.min(maxZoom, zoom));
        }

        document.addEventListener('keydown', function (event) {

            if (event.key === '-') {
                // scrolled down, so zoom should be lower
                handleZoomLevel(-0.05);
            } else if (event.key === '+') {
                // scrolled up, so zoom should be greater
                handleZoomLevel(0.05);
            }

            el.setAttribute('scale', `${zoom} ${zoom} ${zoom}`);

        });

        document.addEventListener('wheel', function (event) {

            if (event.deltaY > 0) {
                handleZoomLevel(-0.05);
            } else {
                handleZoomLevel(0.05);
            }

            el.setAttribute('scale', `${zoom} ${zoom} ${zoom}`);

        });
    }
});

AFRAME.registerComponent('auto-scale', {
    schema: {

    },

    init: function () {
        const el = this.el;

        el.addEventListener('model-loaded', function () {
            const object3D = el.getObject3D('mesh');

            if (object3D) {
                const bbox = new THREE.Box3().setFromObject(object3D);
                const size = bbox.getSize(new THREE.Vector3());

                console.log(size);

                const scene = el.sceneEl;
                const sceneSize = new THREE.Box3().setFromObject(scene.object3D).getSize(new THREE.Vector3());

                const targetSize = sceneSize.multiplyScalar(0.1);

                const maxDimension = Math.max(size.x, size.y, size.z);

                const maxTargetDimension = Math.max(targetSize.x, targetSize.y, targetSize.z);

                const scaleFactor = maxTargetDimension / maxDimension;

                el.setAttribute('scale', `${scaleFactor} ${scaleFactor} ${scaleFactor}`);
            }
        });
    }
});

AFRAME.registerComponent('center-model', {
    init: function () {
        let el = this.el;

        console.log(this);
        el.addEventListener('model-loaded', function () {
            let obj = el.getObject3D('mesh');
            let box = new THREE.Box3().setFromObject(obj);
            let center = box.getCenter(new THREE.Vector3());

            console.log("posizione del centro", center);

            console.log("prima della modifica", obj.position);

            // Move the object so the center of the bounding box always corresponds to the origin
            obj.position.sub(center);

            console.log("dopo la modifica", obj.position);
        });
    }
});

AFRAME.registerComponent('look-at', {
    schema: { type: 'selector' },

    init: function () {},

    tick: function () {
        this.el.object3D.lookAt(this.data.object3D.position);
    }
});

AFRAME.registerComponent('orbit-controls', {
    init: function () {
        let sceneEl = this.el.sceneEl;              // Ottieni la scena
        let cameraEl = this.el;                     // Ottieni l'entità telecamera
        let modelEl = sceneEl.querySelector('#model'); // Seleziona il modello

        // Attendi il caricamento del modello
        modelEl.addEventListener('model-loaded', () => {
            let object3D = modelEl.getObject3D('mesh');   // Ottieni il mesh del modello

            // Calcola il bounding box del modello per ottenere il centro e la dimensione
            let bbox = new THREE.Box3().setFromObject(object3D);
            let center = bbox.getCenter(new THREE.Vector3()); // Trova il centro
            let size = bbox.getSize(new THREE.Vector3());     // Trova la dimensione

            // Ottieni la telecamera A-Frame e configuriamo una PerspectiveCamera
            let camera = cameraEl.getObject3D('camera');
            camera.fov = 75;  // Imposta il campo visivo (Field of View)
            camera.aspect = window.innerWidth / window.innerHeight; // Imposta l'aspetto
            camera.near = 0.1; // Distanza minima del rendering
            camera.far = 1000; // Distanza massima del rendering

            // Calcola la posizione della telecamera per posizionarla frontalmente rispetto al modello
            let distance = size.length() * 2;  // Distanza basata sulla dimensione del modello
            camera.position.set(center.x, center.y, center.z + distance); // Posiziona la telecamera frontalmente
            camera.lookAt(center);   // La telecamera guarda il centro del modello
            camera.updateProjectionMatrix();  // Aggiorna la matrice di proiezione

            // Crea e inizializza i controlli orbitali
            this.controls = new OrbitControls(camera, sceneEl.renderer.domElement);
            this.controls.target.copy(center); // Imposta il punto di rotazione al centro del modello
            this.controls.enableDamping = true; // Abilita un effetto di ammortizzazione per un movimento fluido
            this.controls.dampingFactor = 0.1;  // Fattore di ammortizzazione
            this.controls.minDistance = distance / 2;  // Distanza minima per la telecamera
            this.controls.maxDistance = distance * 3;  // Distanza massima per la telecamera
            this.controls.update();
        });
    },

    tick: function () {
        // Verifica se i controlli orbitali sono stati inizializzati prima di aggiornarli
        if (this.controls) {
            this.controls.update();
        }
    }
});