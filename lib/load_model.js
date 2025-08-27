import {BlobReader, BlobWriter, ZipReader, ZipWriter,} from "https://deno.land/x/zipjs/index.js";
import * as THREE from './three.module.js';
import {OrbitControls} from './addons/OrbitControls.js';
import {GLTFLoader} from './loaders/GLTFLoader.js';
import {CSS2DObject, CSS2DRenderer} from './renderers/CSS2DRenderer.js';
import {CSS3DObject, CSS3DRenderer} from './renderers/CSS3DRenderer.js';
import {gsap} from "https://cdn.jsdelivr.net/npm/gsap@3.12.7/index.js";
import {ARButton} from './webxr/ARButton.js';

// global variables
let indexContainer = document.getElementById('index-container');
let isCustomAnn = false;  // boolean for custom annotation page
let isCrosshair = false;
let json_data;
let model;
let modelName;
let modelScene;
let modelCenter;
let modelSceneCenter;
let defaultCameraPosition = new THREE.Vector3();
let modelUID;
let size;
let positionsOriginal = [];
let positionsNormalized = [];
let scene = new THREE.Scene();
let numberOfCanvas = 0;
let annotationClicked;
let annotationList = [];
let tooltip;
let dourl;
const callbackCancel = function(){removeModalListener();};
let callbackOK;
let event_entities;
let props_temp = new Map;
let sketchfabAnnotations;
let annotationIsDisplayed = false;
let annotationMeshList = [];
let annotationListDiv;
let scale = 1;
let changeCoordinates = false;
let annotationDisplayed = null;
let camera;
let cameraZ;
let renderer;
let controls;
let canvasXR;
const clickableAreas = [];
let planesArray = [];
const annotationsPanel = document.getElementById('annotationsPanel');
let label2DRenderer;
let label3DRenderer;

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
}

function showLoader() {
    document.getElementById('loader').style.display = 'grid';
}

// Functions to load the model correctly

async function loadLocalFile(filePath) {
    const response = await fetch(filePath);
    return await response.blob();
}

async function saveZip(zipBlob, modelName) {
    const formData = new FormData();

    try {
        await formData.append('file', zipBlob, modelName.slice(0, -4) + '.zip'); // ensure that .glb is not in the name
        formData.append('username', username);
        await fetch('./PHP/saveZipModels.php', {
            method: 'POST',
            body: formData
        }).then(response => {
            if (!response.ok) {
                throw new Error(`Error saving the zip file: ${response.status}`);
            }
            return response.text();
        }).then(data => {
            const parsedData = JSON.parse(data);
            if (parsedData.status === 'success') {
                console.log(parsedData.message);
            } else if (parsedData.status === 'error') {
                console.error(parsedData.message, '-->', parsedData.details);
            }
        });
    } catch (error) {
        console.error('Error fetching saveZip script:', error);
    }
}

async function saveGLB(glbBlob, filename) {
    const formData = new FormData();

    try {
        formData.append('file', glbBlob, filename);
        formData.append('username', username);

        await fetch('./PHP/saveGLBModels.php?nocache=' + new Date().getTime(), {
            method: 'POST',
            body: formData
        }).then(response => {
            if (!response.ok) {
                throw new Error(`Error saving the GLB file: ${response.status}`);
            }
            return response.text();
        }).then(data => {
            const parsedData = JSON.parse(data);
            if (parsedData.status === 'success') {
                console.log(parsedData.message);
            } else if (parsedData.status === 'error') {
                console.error(parsedData.message, '-->', parsedData.details);
            }
        });
    } catch (error) {
        console.error('Error fetching the saveGLB script:', error);
    }
}

async function extractZip(zipBlob, modelName) {
    const zipReader = await new ZipReader(await new BlobReader(zipBlob));
    const fileName = modelName.slice(0, -4) + '.glb';

    try {
        const entries = await zipReader.getEntries();
        for (const entry of entries) {
            console.log(`Extracting: ${entry.filename}`);
            if (!entry.directory) {
                const blobWriter = await new BlobWriter();
                const fileBlob = await entry.getData(blobWriter);

                // Save the extracted .glb file locally
                await saveGLB(fileBlob, fileName); // entry.filename
            }
        }
    } catch (error) {
        console.error('Error while extracting ZIP:', error);
    } finally {
        await zipReader.close();
    }
}

async function createZip(chosenModel, username) {
    try {
        // Write ZIP
        const modelName = chosenModel;
        const modelFileBlob = await loadLocalFile("./PHP/3D_models/" + username + "/" + modelName);

        const modelFileReader = await new BlobReader(modelFileBlob);

        const zipFileWriter = await new BlobWriter();

        const zipWriter = await new ZipWriter(zipFileWriter);
        await zipWriter.add(modelName, modelFileReader);
        await zipWriter.close();

        const zipFileBlob = await zipFileWriter.getData();

        // Save ZIP
        const saveResult = await saveZip(zipFileBlob, modelName);

        if (saveResult) {
            await extractZip(zipFileBlob, modelName);
        }

        return modelName;

    } catch (e) {
        console.log(e);
        showModal(
            true,
            'Error',
            e,
            undefined,
            'Return to home',
            function() {
            },
            function() {
                window.location.href = './index.html';
            }
        );
    }
}

async function changeBody(chosenModel, username) {
    try {

        return await createZip(chosenModel, username);

    } catch (e) {
        console.log(e);
        showModal(
            true,
            'Error',
            e,
            undefined,
            'Return to home',
            function() {
            },
            function() {
                window.location.href = './index.html';
            }
        );
    }
}

// End part of functions to load the model correctly

// get parameters from URL
function getParamValue (paramName) {
    let url = window.location.search.substring(1); // get rid of "?" in the querystring

    let args = url.split('&'); // split arguments

    for (let i = 0; i < args.length; i++) {

        let pArr = args[i].split('='); // split key and value
        if (pArr[0] === paramName) {    // if the argument corresponds to the given parameter name return the value
            return pArr[1];
        }

    }

    return null;
}

const chosenModel = getParamValue('model');
const customAnn = getParamValue('custom');
const username = getParamValue('username');

// if the page is customAnn.html
if (customAnn) {

    // if session is expired redirect to the login page
    fetch('./PHP/checkSession.php?nocache=' + new Date().getTime())
        .then(res => res.json())
        .then(async function (data) {

            if (data.loggedIn) isCustomAnn = true;
            else {

                showModal(
                    true,
                    'Session expired',
                    'Please login again.',
                    undefined,
                    'OK',
                    function() {
                    },
                    function() {
                        window.location.href = './index.html';
                    }
                );

            }

        })
        .catch(err => {

            console.error('Error during session check:', err);

            showModal(
                true,
                'Session check error',
                'Unable to check session. Please check your internet connection.',
                undefined,
                'OK',
                function() {
                },
                function() {
                }
            );

        });

}

if (!chosenModel) throw new Error('No model found.');
else {

    // if the file is a zip, extract it and load the model, otherwise load the model, create a zip and delete the .glb file
    const extension = chosenModel.slice(-4);

    if (extension === '.zip') {

        try {
            modelName = chosenModel;

            const zipFileBlob = await loadLocalFile("./PHP/3D_models/" + username + "/" + modelName);

            await extractZip(zipFileBlob, modelName);
        } catch (e) {
            console.error(e);
            showModal(
                true,
                'Error',
                e,
                undefined,
                'Return to home',
                function() {
                },
                function() {
                    window.location.href = './index.html';
                }
            );
        }

    } else if (extension === '.glb') {

        modelName = await changeBody(chosenModel, username);

    }

    // three.js scene - global variables
    let cameraFov;
    let mesh;
    let raycaster = new THREE.Raycaster();
    let box;
    let lights = [];
    let originalDistance = null;
    let zoomLevel;
    let ARbutton;
    let controller;
    let tempMatrix = new THREE.Matrix4();
    let pointer = undefined;
    let selectedObject = null;
    let initialControllerPosition = new THREE.Vector3();
    let isDragging = false;
    let isRotating = false;
    let isRotatingTouch = false;
    let isZooming = false;
    let activeHandedness = null;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    let gestureCleanup = null;
    let modelID;
    let laser;

    async function initXR() {

        // Camera
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);

        // Model
        const loader = new GLTFLoader();
        loader.crossOrigin = 'anonymous';
        await loader.load('./PHP/3D_models/' + username + '/' + modelName.slice(0, -4) + '.glb', async function(gltf) {
            modelScene = gltf.scene;
            modelScene.name = "modelScene";

            model = modelScene.children[0];

            model.name = "model";

            mesh = model.children[0].children[0];

            // Reset scale
            modelScene.scale.set(1.0, 1.0, 1.0);
            // Calculate model size
            modelScene.updateMatrixWorld();
            box = new THREE.Box3().setFromObject(modelScene);
            size = box.getSize(new THREE.Vector3());
            // Calculate the scale factor to resize the model to the human scale.
            scale = 1.6 / size.y;
            scale = 2.0 / size.x < scale ? 2.0 / size.x : scale;
            scale = 2.0 / size.z < scale ? 2.0 / size.z : scale;
            modelScene.scale.set(scale, scale, scale);
            gltf.scale = [scale, scale, scale];

            // Center model at 0, 0, 0
            modelScene.updateMatrixWorld();
            box = new THREE.Box3().setFromObject(modelScene);
            modelSceneCenter = box.getCenter(new THREE.Vector3());
            size = box.getSize(new THREE.Vector3());
            // Center model with respect to the scene
            modelScene.position.x = -modelSceneCenter.x;
            modelScene.position.y = -modelSceneCenter.y;
            modelScene.position.z = -modelSceneCenter.z;

            scene.add(modelScene);

            // Lights
            lights[0] = new THREE.AmbientLight(0xffffff, 2.0);

            lights[1] = new THREE.DirectionalLight(0xffffff, 1.2);
            lights[1].position.set(modelSceneCenter.x + size.x, modelSceneCenter.y + size.y, modelSceneCenter.z + size.z);
            lights[1].target.position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z);
            scene.add(lights[1].target);

            lights[2] = new THREE.DirectionalLight(0xffffff, 1.2);
            lights[2].position.set(modelSceneCenter.x - size.x, modelSceneCenter.y - size.y / 2, modelSceneCenter.z - size.z);
            lights[2].target.position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z);
            scene.add(lights[2].target);

            lights[3] = new THREE.DirectionalLight(0xffffff, 1.2);
            lights[3].position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z + size.z);
            lights[3].target.position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z);
            scene.add(lights[3].target);

            lights[4] = new THREE.DirectionalLight(0xffffff, 1.2);
            lights[4].position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z - size.z);
            lights[4].target.position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z);
            scene.add(lights[4].target);

            lights[5] = new THREE.DirectionalLight(0xffffff, 1.2);
            lights[5].position.set(modelSceneCenter.x - size.x, modelSceneCenter.y - size.y / 2, modelSceneCenter.z + size.z);
            lights[5].target.position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z);
            scene.add(lights[5].target);

            lights[6] = new THREE.DirectionalLight(0xffffff, 1.2);
            lights[6].position.set(modelSceneCenter.x + size.x, modelSceneCenter.y + size.y, modelSceneCenter.z - size.z);
            lights[6].target.position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z);
            scene.add(lights[6].target);

            lights[7] = new THREE.DirectionalLight(0xffffff, 1.2);
            lights[7].position.set(modelSceneCenter.x, modelSceneCenter.y + size.y, modelSceneCenter.z);
            lights[7].target.position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z);
            scene.add(lights[7].target);

            lights[8] = new THREE.DirectionalLight(0xffffff, 1.2);
            lights[8].position.set(modelSceneCenter.x, modelSceneCenter.y - size.y / 2, modelSceneCenter.z);
            lights[8].target.position.set(modelSceneCenter.x, modelSceneCenter.y, modelSceneCenter.z);
            scene.add(lights[8].target);

            lights[9] = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);

            scene.add(lights[0]);
            scene.add(lights[1]);
            scene.add(lights[2]);
            scene.add(lights[3]);
            scene.add(lights[4]);
            scene.add(lights[5]);
            scene.add(lights[6]);
            scene.add(lights[7]);
            scene.add(lights[8]);
            scene.add(lights[9]);

            // Camera positioning
            box = new THREE.Box3().setFromObject(modelScene);
            modelCenter = box.getCenter(new THREE.Vector3());
            size = box.getSize(new THREE.Vector3());

            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            cameraZ = maxDim / (2 * Math.tan(fov / 2)); // Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.5;
            cameraZ *= 1.5;

            // Decide the dominant direction to set the view
            if (size.y < size.x && size.y < size.z) {
                // Low altitude --> top view (map)
                defaultCameraPosition.set(modelCenter.x, modelCenter.y + cameraZ, modelCenter.z);
            } else if (size.z > size.x && size.z > size.y) {
                // Deeper in Z --> front view on Z
                defaultCameraPosition.set(modelCenter.x, modelCenter.y, modelCenter.z + cameraZ);
            } else {
                // Generic case: isometric view
                defaultCameraPosition.set(modelCenter.x + cameraZ, modelCenter.y + cameraZ, modelCenter.z + cameraZ);
            }

            defaultCameraPosition.z += cameraZ * 0.1;   // fix for a camera bug when size.y is the lowest value

            camera.position.set(defaultCameraPosition.x, defaultCameraPosition.y, defaultCameraPosition.z);

            camera.lookAt(modelCenter);
            camera.updateProjectionMatrix();

            cameraFov = camera.fov;

            // body
            document.body.style.width = `${window.innerWidth}px`;
            document.body.style.height = `${window.innerHeight}px`;

            // Renderer
            renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});

            // CSS 2D Renderer
            label2DRenderer = new CSS2DRenderer();
            label2DRenderer.domElement.id = 'label-renderer';

            // CSS 3D Renderer
            label3DRenderer = new CSS3DRenderer();
            label3DRenderer.domElement.id = 'label-renderer-3d';

            // grid layout - loaded from customAnn.html
            if (isCustomAnn) {

                // renderer
                const sceneDiv = document.getElementById('scene-container');
                setSceneSize(renderer);
                renderer.setPixelRatio(window.devicePixelRatio);
                sceneDiv.appendChild(renderer.domElement);

                sceneDiv.appendChild(label2DRenderer.domElement);

                sceneDiv.appendChild(label3DRenderer.domElement);

            } else {

                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.setPixelRatio(window.devicePixelRatio);
                document.body.appendChild(renderer.domElement);

                document.body.appendChild(label2DRenderer.domElement);

                document.body.appendChild(label3DRenderer.domElement);

            }

            renderer.xr.enabled = true; // this line is important to enable the renderer for WebXR
            renderer.setAnimationLoop(animate);
            //renderer.domElement.style.background = "linear-gradient(to bottom, #000000, #333333)"; // background CSS
            renderer.domElement.style.backgroundImage = 'linear-gradient(\n' +
                '        to bottom,\n' +
                '        #000000 0%,\n' +
                '        #333333 50%,\n' +
                '        #ffffff 50%,\n' +
                '        #cccccc 100%\n' +
                '      )';
            renderer.domElement.style.backgroundSize = '100% 200%';
            renderer.domElement.style.backgroundPosition = 'top';
            renderer.domElement.style.transition = 'background-position 0.2s ease';
            renderer.domElement.setAttribute('id', 'canvas-scene');

            renderer.xr.addEventListener('sessionstart', () => {

                switchScene();

                // for touchscreen devices - rotation and zoom gestures
                if (isTouch) gestureCleanup = setupARGestures();

            });
            renderer.xr.addEventListener('sessionend', () => {

                switchScene();

                // for touchscreen devices - rotation and zoom gestures
                if (gestureCleanup) {
                    gestureCleanup();
                    gestureCleanup = null;
                }

                // reset camera position
                camera.position.set(defaultCameraPosition.x, defaultCameraPosition.y, defaultCameraPosition.z);

                camera.lookAt(modelCenter);
                camera.updateProjectionMatrix();

                camera.fov = cameraFov;

                // reset modelScene position
                modelScene.position.x = -modelSceneCenter.x;
                modelScene.position.y = -modelSceneCenter.y;
                modelScene.position.z = -modelSceneCenter.z;

            });

            // Controls - Zoom
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableZoom = true;
            controls.minDistance = 0.01;
            controls.maxDistance = 10;

            controls.addEventListener("change", getControlsZoom);

            // Controller - immersive-ar
            controller = renderer.xr.getController(0);
            controller.addEventListener('selectstart', onSelectStart);
            controller.addEventListener('selectend', onSelectEnd);
            scene.add(controller);

            // Laser - immersive-ar
            const laserGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -0.5)
            ]);
            const laserMaterial = new THREE.LineBasicMaterial({color: 0xffffff});
            laser = new THREE.Line(laserGeometry, laserMaterial);
            laser.scale.z = 4; // laser length
            controller.add(laser);

            // load viewer and annotations

            // create sketchfab viewer iframe
            let apiFrame = document.createElement('iframe');
            apiFrame.setAttribute('id', 'api-frame');
            apiFrame.setAttribute('allowfullscreen', '');
            apiFrame.setAttribute('mozallowfullscreen', 'true');
            apiFrame.setAttribute('webkitallowfullscreen', 'true');
            indexContainer.append(apiFrame);

            // start viewer
            let iframe = document.getElementById('api-frame');
            let client = new Sketchfab('1.12.1', iframe);

            // it takes the model ID directly from a json file
            await fetch('./json/' + username + '/' + modelName.slice(0, -4) + '.json?nocache=' + new Date().getTime())
                .then(response => response.json())
                .then(function (data) {

                    // store all json information in a global variable
                    json_data = data;

                    // iterate over events until the model ID is found
                    for (let property in data["events"]) {
                        if (Object.keys(data["events"][property]).includes('sketchfabidmodel')) {
                            modelUID = data["events"][property]["sketchfabidmodel"];
                        }
                    }

                    event_entities = data["entities"]; // keep props in order

                    loadAnnotations();

                }).catch(error => {

                    // If the file does not exist, we create a new JSON with a basic structure
                    console.warn(error + ' Creating a new file.');

                    let userTitle;

                    callbackOK = function () {

                        const modalNarrative = document.querySelector('.modal #modal-narrative-title');
                        if (modalNarrative) userTitle = modalNarrative.value;

                        // set timeout to wait for the previous modal to close
                        setTimeout(() => {

                            // new sketchfab id
                            showModal(
                                true,
                                'Sketchfab ID',
                                'Enter a model ID for the narrative, only if you downloaded the model from Sketchfab otherwise leave blank:\n' +
                                '<input id="modal-sketchfab-id" type="text" class="form-control">',
                                undefined,
                                'Confirm',
                                function () {
                                },
                                function () {

                                    const modalSketchfab = document.querySelector('.modal #modal-sketchfab-id');
                                    if (modalSketchfab.value) modelID = modalSketchfab.value;

                                    // if the user specifies a model ID then overwrite the one from JSON file
                                    if (modelID) modelUID = modelID;

                                    // if the user does not specify anything, insert an empty string
                                    if (!userTitle) userTitle = "AR-default";

                                    json_data = {
                                        narra: {
                                            "id": "",
                                            "_id": "",
                                            "name": userTitle,
                                            "author": "3D-user",
                                            "idNarra": "",
                                            "coverImg": ""
                                        },
                                        events: {},
                                        entities: {}
                                    };

                                    saveJson(modelName, json_data);
                                    loadAnnotations();
                                    removeModalListener();

                                }

                            );

                            removeModalListener();

                        }, 500);

                    }

                    // new narrative title
                    showModal(
                        true,
                        'Narrative title',
                        'Enter a title for the narrative:\n' + '<input id="modal-narrative-title" type="text" value="AR-default" class="form-control">',
                        undefined,
                        'Confirm',
                        function () {
                        },
                        callbackOK
                    );

                });

            async function loadAnnotations() {

                // if there are events, get positions and normalize them - useful for sorting events in saveJSONAnnotations()
                if (hasEvents(json_data.events)) {
                    positionsOriginal = extractPositions(json_data.events);
                    positionsNormalized = normalizePositions(positionsOriginal);
                }

                // start sketchfab API
                await client.init(modelUID, {
                    success: async function (api) {
                        api.start();
                        await api.addEventListener('viewerready', async function () {

                            await api.getAnnotationList(async function (err, annotations) {
                                if (!err) {

                                    sketchfabAnnotations = annotations;

                                    runApp();

                                } else {
                                    console.error('Error retrieving annotations:', err);
                                }
                            });

                        });
                    },
                    error: function (error) {

                        console.warn(error + ' (ID ' + modelUID + ')');

                        runApp();

                    }
                });

            }

            function runApp() {

                let ul, ulAnn;

                // for incompatible devices with dom-overlay - HoloLens
                // annotations are dynamically moved from this div to 2D/3D renderers
                annotationListDiv = document.createElement('div');
                annotationListDiv.setAttribute('id', 'annotation-list-div');
                document.body.appendChild(annotationListDiv);
                annotationListDiv.style.display = 'none';

                if (!isCustomAnn) {

                    // show "back to home" button and append event listener
                    const backToHome = document.getElementById('back-to-home');
                    backToHome.style.display = 'inline-block';
                    backToHome.addEventListener('click', function () {
                        window.location.href = './index.html';
                    });

                    const buttonsDiv = document.createElement('div');
                    buttonsDiv.setAttribute('id', 'buttons-container');
                    document.body.appendChild(buttonsDiv);

                    const customButton = document.createElement('button');
                    customButton.setAttribute('type', 'button');
                    customButton.setAttribute('id', 'custom-annotations');
                    customButton.setAttribute('value', 'Customize annotations');
                    customButton.innerText = 'Customize annotations';
                    buttonsDiv.appendChild(customButton);
                    customButton.addEventListener('click', function () {
                        // add the boolean argument that checks if we are in the "customize annotations" page, so to disable unnecessary things like the legend and the AR button

                        // if session is expired redirect to the login page
                        fetch('./PHP/checkSession.php?nocache=' + new Date().getTime())
                            .then(res => res.json())
                            .then(async function (data) {

                                if (data.loggedIn) {

                                    const url = `customAnn.html?model=${modelName.slice(0, -4)}.zip&username=${username}&custom=true&nocache=` + new Date().getTime();
                                    window.open(url, '_blank');

                                } else {

                                    showModal(
                                        true,
                                        'Session expired',
                                        'Please login again.',
                                        undefined,
                                        'OK',
                                        function() {
                                        },
                                        function() {
                                            window.location.href = './index.html';
                                        }
                                    );

                                }

                            })
                            .catch(err => {

                                console.error('Error during session check:', err);

                                showModal(
                                    true,
                                    'Session check error',
                                    'Unable to check session. Please check your internet connection.',
                                    undefined,
                                    'OK',
                                    function() {
                                    },
                                    function() {
                                    }
                                );

                            });

                    });

                    // add the AR button to the body of the DOM and enable overlay functionality (for the annotation panel)
                    ARbutton = ARButton.createButton(renderer, {
                        optionalFeatures: ['dom-overlay'],
                        domOverlay: {root: document.getElementById('label-renderer-3d')}
                    });
                    buttonsDiv.appendChild(ARbutton);

                    // initialise annotations panel for quick link to annotations
                    ul = document.createElement('ul');
                    ul.setAttribute('id', 'annotation-list');
                    ulAnn = annotationsPanel.appendChild(ul);

                    // show the annotations panel
                    annotationsPanel.style.display = 'block';

                } else {

                    // add the "Download JSON" button
                    const downloadButton = document.createElement('button');
                    downloadButton.setAttribute('type', 'button');
                    downloadButton.setAttribute('id', 'download-json');
                    downloadButton.setAttribute('class', 'btn btn-default');
                    downloadButton.textContent = 'Download JSON';
                    downloadButton.addEventListener('click', function () {
                        download(JSON.stringify(json_data, null, 2), modelName.slice(0, -4) + '.json');
                    });
                    document.getElementById('custom-buttons-container').appendChild(downloadButton);

                    // add "+" button
                    const addAnnotationButton = document.getElementById('add-annotation-button');
                    const sceneContainer = document.getElementById('scene-container');

                    addAnnotationButton.style.display = 'block';
                    addAnnotationButton.classList.add('btn-secondary');
                    addAnnotationButton.addEventListener('click', () => {

                        changeCoordinates = false;

                        // invert the state
                        isCrosshair = !isCrosshair;

                        isCrosshair
                            ? sceneContainer.style.cursor = 'crosshair'
                            : sceneContainer.style.cursor = 'default';

                        // enable/disable the 'Change coordinates' button
                        switchButtonVisibility(document.getElementById("change-coordinates"));

                        const alertDiv = document.getElementById('add-annotation-alert');
                        if (!alertDiv) showAlert('add-annotation-alert', 'Click a point on the model. Press the button again to exit.', 'info', -1);   // show info alert
                        else if (alertDiv.parentNode) alertDiv.parentNode.removeChild(alertDiv);

                    });

                    //const spriteScale = computeAnnotationScale(model);

                    // track click to place an annotation
                    renderer.domElement.addEventListener('pointerdown', (event) => {

                        // check if the 'add annotation' button is clicked
                        if (sceneContainer.style.cursor === 'crosshair') {

                            const rect = renderer.domElement.getBoundingClientRect();

                            raycaster.setFromCamera({
                                x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
                                y: -((event.clientY - rect.top) / rect.height) * 2 + 1
                            }, camera);

                            const intersects = raycaster.intersectObject(model, true);

                            if (intersects.length > 0) {

                                try {
                                    let coordinates = intersects[0].point.clone();
                                    model.worldToLocal(coordinates);

                                    // get camera position
                                    const cameraPosition = camera.position.clone();

                                    if (changeCoordinates) {

                                        // get number
                                        const number = document.getElementById('old-position').textContent;

                                        // save css2d object from 2d renderer
                                        const css2dAnnotation = label2DRenderer.domElement.querySelector(`.annotation[data-before="${number}"]`);

                                        let allSceneSprites = [
                                            ...scene.getObjectsByProperty('name', parseInt(number)),
                                            ...scene.getObjectsByProperty('name', String(number))
                                        ];

                                        let allModelSprites = [
                                            ...model.getObjectsByProperty('name', parseInt(number)),
                                            ...model.getObjectsByProperty('name', String(number))
                                        ];

                                        allSceneSprites.forEach(sprite => {
                                            sprite.position.copy(coordinates);
                                        });

                                        allModelSprites.forEach(sprite => {
                                            sprite.position.copy(coordinates);

                                            // re-append css2d object
                                            label2DRenderer.domElement.appendChild(css2dAnnotation);
                                        });

                                        document.getElementById('coordinates').value = coordinates.x + "," + coordinates.y + "," + coordinates.z;

                                        // enable "save" button
                                        document.getElementById('save-annotation').disabled = false;

                                    } else {

                                        // create DOM element
                                        const text = 'New annotation';
                                        createAnnotationDOM(text, '', numberOfCanvas + 1, coordinates, annotationListDiv);

                                        // create a new canvas
                                        let newAnnotationCanvas = createCanvas(numberOfCanvas);

                                        createSprite(newAnnotationCanvas, coordinates, numberOfCanvas);

                                        numberOfCanvas++;

                                        // generate the event ID
                                        const eventName = 'customAnnotation' + getRandomEventID();

                                        // add annotation to the list <div> in HTML
                                        addAnnotationToList(text, numberOfCanvas, coordinates, eventName);

                                        // show form
                                        document.getElementById('form-inner').style.display = 'block';

                                        // get input fields
                                        const [title, description, point, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, oldPosition, eventID, cameraPos] = getFormFields();

                                        // fill annotation form
                                        fillForm(title, description, point, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, coordinates, numberOfCanvas, oldPosition, eventID, eventName, true, cameraPos);

                                        // save the new annotation
                                        saveJSONAnnotations(true);

                                        // disable "save" button until user changes something
                                        document.getElementById('save-annotation').disabled = true;

                                        // display alert
                                        showAlert('annotation-creation', 'Annotation created and saved successfully!', 'success');

                                    }

                                    document.getElementById('camera-position').textContent = cameraPosition.x + "," + cameraPosition.y + "," + cameraPosition.z;

                                    sceneContainer.style.cursor = 'default';
                                    isCrosshair = !isCrosshair;

                                    // re-enable coordinate button and disable 'change' one
                                    switchButtonVisibility(document.getElementById("add-annotation-button"), true);
                                    switchButtonVisibility(document.getElementById("change-coordinates"), true);

                                    // remove alert
                                    document.getElementById('alert-placeholder').innerHTML = "";

                                } catch (e) {
                                    showAlert('error', 'Error:' + e, 'danger', 2000);
                                    console.error('Error adding new annotation:', e);
                                }
                            }
                        }
                    });
                }

                const events = sortEntries(Object.entries(json_data.events), positionsOriginal, positionsNormalized);

                let annotationListTemp = [];    // temporary list for sorting annotations

                let coordinatesAdded = false;   // check if there are events without a coordinate field
                let cameraPositionAdded = false;   // check if there are events without a camera position field
                let modelnameAdded = false;   // check if there are events without a model name field

                const modelNameGlb = modelName.slice(0, -4) + '.glb';

                // load annotations from sketchfab if the user has entered a sketchfab ID
                if (sketchfabAnnotations) {

                    sketchfabAnnotations.forEach(function (ann) {

                        let index = sketchfabAnnotations.indexOf(ann);

                        if (modelID) {

                            const thisAnn = new THREE.Vector3(
                                ann.position[0],
                                ann.position[1],
                                ann.position[2]
                            );

                            const cameraPosition = setDefaultCameraPosition();

                            const thisCamera = new THREE.Vector3(
                                cameraPosition.x,
                                cameraPosition.y,
                                cameraPosition.z
                            );

                            annotationListTemp.push({
                                index: index+1,
                                title: ann.name,
                                description: '',
                                coordinates: thisAnn,
                                cameraPosition: thisCamera,
                                modelName: modelNameGlb,
                                id: 'ev' + getRandomEventID()
                            });

                        // load information from json if modelID is undefined
                        } else {

                            for (let i = 0; i < events.length; i++) {
                                if ('annotationNumber3DModel' in events[i][1] && parseInt(events[i][1].annotationNumber3DModel) === index + 1) {
                                    let description;
                                    if (events[i][1].text.text.trim() !== '<p></p>') description = events[i][1].text.text;    // avoid empty paragraph
                                    else description = '';

                                    // Get coordinates of the annotation (x, y, z)
                                    let thisCoors = new THREE.Vector3(
                                        ann.position[0],
                                        ann.position[1],
                                        ann.position[2]
                                    );

                                    const cameraPosition = setDefaultCameraPosition();

                                    // Get camera position of the annotation (x, y, z)
                                    let thisCameraPosition = new THREE.Vector3(
                                        cameraPosition.x,
                                        cameraPosition.y,
                                        cameraPosition.z
                                    );

                                    let thisAnn;
                                    let thisCamera;

                                    if ("coordinates" in events[i][1]) {

                                        if (thisCoors.equals(events[i][1].coordinates)) {
                                            thisAnn = thisCoors;
                                        } else {
                                            const coordinatesVector = events[i][1].coordinates;
                                            thisAnn = new THREE.Vector3(
                                                parseFloat(coordinatesVector.x),
                                                parseFloat(coordinatesVector.y),
                                                parseFloat(coordinatesVector.z)
                                            );
                                        }

                                    } else {

                                        thisAnn = thisCoors;

                                        // add coordinate property to the event if missing
                                        if (!('coordinates' in json_data.events[events[i][1]._id])) {
                                            json_data.events[events[i][1]._id].coordinates = thisAnn;
                                            coordinatesAdded = true;
                                        }

                                    }

                                    if ("cameraPosition" in events[i][1]) {

                                        if (thisCameraPosition.equals(events[i][1].cameraPosition)) {
                                            thisCamera = thisCameraPosition;
                                        } else {
                                            const cameraVector = events[i][1].cameraPosition;
                                            thisCamera = new THREE.Vector3(
                                                parseFloat(cameraVector.x),
                                                parseFloat(cameraVector.y),
                                                parseFloat(cameraVector.z)
                                            );
                                        }

                                    } else {

                                        thisCamera = thisCameraPosition;

                                        // add camera position property to the event if missing
                                        if (!('cameraPosition' in json_data.events[events[i][1]._id])) {
                                            json_data.events[events[i][1]._id].cameraPosition = thisCamera;
                                            cameraPositionAdded = true;
                                        }

                                    }

                                    // add model name property to the event if missing
                                    if (!('modelName' in json_data.events[events[i][1]._id])) {
                                        json_data.events[events[i][1]._id].modelName = modelNameGlb;
                                        modelnameAdded = true;
                                    }

                                    annotationListTemp.push({
                                        index: positionsNormalized[positionsOriginal.indexOf(parseInt(events[i][1].position))],
                                        title: events[i][1].title,
                                        description: description,
                                        coordinates: thisAnn,
                                        cameraPosition: thisCamera,
                                        modelName: modelNameGlb,
                                        id: events[i][1]._id
                                    });

                                }
                            }

                        }

                    });

                }

                // check and load annotations created by the user
                events.forEach(([key, value]) => {
                    if (key.includes('customAnnotation')) {
                        let title = value.text.headline;

                        let description;
                        if (value.text.text.trim() !== '<p></p>') description = value.text.text;    // avoid empty paragraph
                        else description = '';

                        let coordinates = new THREE.Vector3(
                            value.coordinates.x,
                            value.coordinates.y,
                            value.coordinates.z
                        );
                        let cameraPosition = new THREE.Vector3(
                            value.cameraPosition.x,
                            value.cameraPosition.y,
                            value.cameraPosition.z
                        );

                        annotationListTemp.push({
                            index: positionsNormalized[positionsOriginal.indexOf(parseInt(value.position))],
                            title: title,
                            description: description,
                            coordinates: coordinates,
                            cameraPosition: cameraPosition,
                            modelName: modelNameGlb,
                            id: value._id
                        });
                    }
                });

                if (modelID) saveNewSketchfabNarrative(annotationListTemp);
                else if (coordinatesAdded || cameraPositionAdded || modelnameAdded) saveJson(modelName, json_data);

                // sort annotations by index from json/sketchfab
                annotationListTemp.sort((a, b) => positionsNormalized.indexOf(a.index) - positionsNormalized.indexOf(b.index));
                annotationListTemp.sort((a, b) => a.index - b.index);

                //const spriteScale = computeAnnotationScale(model);

                // create annotation elements in DOM
                annotationListTemp.forEach((ann, index) => {

                    // create DOM element
                    createAnnotationDOM(ann.title, ann.description, index + 1, ann.coordinates, annotationListDiv);

                    // Number
                    let annotationCanvas = createCanvas(index);
                    numberOfCanvas++;

                    // Sprites - circles and numbers
                    let spriteFront = createSprite(annotationCanvas, ann.coordinates, index);

                    if (isCustomAnn) {
                        // annotation list
                        addAnnotationToList(ann.title, index + 1, ann.coordinates, ann.id);
                    } else {
                        // add annotation button in annotationsPanel
                        appendButtonToPanel(index, spriteFront, renderer, ann.title, ulAnn, ann.cameraPosition);
                    }
                });

                if (!isCustomAnn && ulAnn.scrollHeight > annotationsPanel.clientHeight) annotationsPanel.style.overflowY = 'scroll';
                else if (!isCustomAnn) annotationsPanel.style.overflowY = 'none';

                // add the checkbox if there are annotations in the annotation list
                if (ul && ul.children.length > 0) {

                    ul.style.transition = 'opacity 0.2s ease';

                    const checkbox = document.createElement('input');
                    checkbox.setAttribute('id', 'checkbox-filter');
                    checkbox.setAttribute('type', 'checkbox');
                    checkbox.setAttribute('value', 'Show panel');
                    checkbox.setAttribute('checked', '');
                    checkbox.addEventListener('change', function () {
                        if (this.checked) {
                            // show the panel
                            ul.style.display = 'block';
                            setTimeout(() => {
                                ul.style.opacity = '1';
                            }, 10);
                        } else {
                            // hide the panel
                            ul.style.opacity = '0';
                            setTimeout(() => {
                                ul.style.display = 'none';
                            }, 300);
                        }
                    });

                    const label = document.createElement('label');
                    label.setAttribute('for', 'checkbox-filter');
                    label.setAttribute('id', 'checkbox-label');
                    label.textContent = 'Show panel';

                    const checkboxDiv = document.createElement('div');
                    checkboxDiv.setAttribute('id', 'checkbox-div');
                    checkboxDiv.appendChild(checkbox);
                    checkboxDiv.appendChild(label);
                    annotationsPanel.appendChild(checkboxDiv);

                } else {

                    if (!isCustomAnn) annotationsPanel.style.display = 'none';

                }

                // list of commands in the user guide
                const help = document.getElementById('help-container');
                help.addEventListener('click', function (e) {

                    e.preventDefault();

                    const guide = "<h5>Mouse</h5>" +
                        "<h6>3D viewer</h6>" +
                        "<ul>" +
                        "<li>Single click on numbers <i class=\"fa-solid fa-arrow-right\"></i> open/close related annotation;</li>" +
                        "<li>Double click inside model <i class=\"fa-solid fa-arrow-right\"></i> set new camera pivot point;</li>" +
                        "<li>Double click outside model <i class=\"fa-solid fa-arrow-right\"></i> reset camera pivot point;</li>" +
                        "<li>Click and hold on the model <i class=\"fa-solid fa-arrow-right\"></i> move it around the scene;</li>" +
                        "<li>Scroll wheel <i class=\"fa-solid fa-arrow-right\"></i> zoom in/out the scene;</li>" +
                        "<li>Hold with right single click <i class=\"fa-solid fa-arrow-right\"></i> move the camera freely horizontally and vertically.</li>" +
                        "</ul>" +
                        "<h5>Touchscreen</h5>" +
                        "<h6>3D viewer</h6>" +
                        "<ul>" +
                        "<li>Single tap on numbers <i class=\"fa-solid fa-arrow-right\"></i> open/close related annotation;</li>" +
                        "<li>Double tap inside model <i class=\"fa-solid fa-arrow-right\"></i> set new camera pivot point;</li>" +
                        "<li>Double tap outside model <i class=\"fa-solid fa-arrow-right\"></i> reset camera pivot point;</li>" +
                        "<li>Tap and hold on the model <i class=\"fa-solid fa-arrow-right\"></i> move it around the scene;</li>" +
                        "<li>Pinch two fingers together/apart <i class=\"fa-solid fa-arrow-right\"></i> zoom in/out the scene;</li>" +
                        "<li>Hold with double fingers <i class=\"fa-solid fa-arrow-right\"></i> move the camera freely horizontally and vertically.</li>" +
                        "</ul>" +
                        "<h6>AR mode</h6>" +
                        "<ul>" +
                        "<li>Single tap on numbers <i class=\"fa-solid fa-arrow-right\"></i> open/close related annotation;</li>" +
                        "<li>Pinch two fingers together/apart <i class=\"fa-solid fa-arrow-right\"></i> zoom in/out the model;</li>" +
                        "<li>Hold with three fingers <i class=\"fa-solid fa-arrow-right\"></i> rotate the model;</li>" +
                        "</ul>" +
                        "<h5>AR devices (Hololens, Quest, etc.)</h5>" +
                        "<h6>3D viewer</h6>" +
                        "<ul>" +
                        "<li>The finger is considered a mouse, so please refer to the \"Mouse\" section.</li>" +
                        "</ul>" +
                        "<h6>AR mode</h6>" +
                        "<p>The tap gesture depends on the device. Please read the instruction manual of your device.</p>" +
                        "<ul>" +
                        "<li>Single tap on numbers <i class=\"fa-solid fa-arrow-right\"></i> open/close related annotation;</li>" +
                        "<li>Tap and hold on the model with the right hand <i class=\"fa-solid fa-arrow-right\"></i> move the model and the annotations around.</li>" +
                        "<li>Tap and hold on the model with the left hand <i class=\"fa-solid fa-arrow-right\"></i> rotate the model.</li>" +
                        "</ul>";

                    showModal(
                        false,
                        'Command legend',
                        guide,
                        undefined,
                        undefined,
                        function () {
                        },
                        function () {
                        }
                    );

                });

                // handle mouse over annotations
                window.addEventListener('mousemove', onMouseMove, false);
                function onMouseMove(event) {
                    raycaster.setFromCamera({
                        x: (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
                        y: -(event.clientY / renderer.domElement.clientHeight) * 2 + 1
                    }, camera);

                    // select all sprites
                    let allAnnotations = getAllSprites(scene);

                    let intersects = raycaster.intersectObjects(allAnnotations, true);

                    const sceneContainer = document.getElementById('scene-container');

                    // reset canvas
                    document.querySelectorAll('canvas.number').forEach(canvas => canvas.remove());

                    if (intersects.length > 0) {

                        // switch cursor to pointer
                        isCustomAnn
                            ? sceneContainer.style.cursor = 'pointer'
                            : document.body.style.cursor = 'pointer';

                        // if there are more than one sprite then highlight only the sprite closest to the camera - front and rear
                        if (intersects.length > 2) intersects = intersects.slice(0, 2);

                        // switch canvas border color
                        // white when is not hovered
                        allAnnotations.forEach(annotation => {
                            if (annotation.userData.isHovered && !intersects.includes(annotation) && annotationDisplayed !== annotation.name) {
                                changeCanvasColor(annotation, 'white');
                                annotation.userData.isHovered = false;
                            }
                        });

                        // red when is hovered
                        intersects.forEach(annotation => {
                            const sprite = annotation.object;
                            if (!sprite.userData.isHovered) {
                                changeCanvasColor(sprite, '#f03355');
                                sprite.userData.isHovered = true;
                            }
                        });

                    } else {

                        // all borders must be white when not hovered
                        allAnnotations.forEach(annotation => {
                            if (annotation.userData.isHovered && !intersects.includes(annotation) && annotationDisplayed !== annotation.name) {
                                changeCanvasColor(annotation, 'white');
                                annotation.userData.isHovered = false;
                            }
                        });

                        // switch cursor when the user clicks the "change coordinates" button
                        if (isCustomAnn) {
                            if (isCrosshair) {
                                sceneContainer.style.cursor = 'crosshair';
                            } else {
                                sceneContainer.style.cursor = 'default';
                            }
                        } else {
                            document.body.style.cursor = 'default';
                        }

                    }
                }

                // click event - open the clicked event/annotation
                renderer.domElement.addEventListener("mousedown", function(event) {
                    raycaster.setFromCamera(
                        {
                            x: (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
                            y: -(event.clientY / renderer.domElement.clientHeight) * 2 + 1
                        },
                        camera
                    );

                    // select all sprites
                    let allAnnotations = getAllSprites(scene);

                    // re-order sprites to match the annotation list order in DOM
                    allAnnotations.sort((a, b) => a.name - b.name);

                    const intersects = raycaster.intersectObjects(allAnnotations, true);
                    if (intersects.length > 0) {

                        const i = intersects[0].object.name;

                        // close the annotation if it is already open - avoid if user is changing coordinates
                        if (annotationIsDisplayed && i === annotationDisplayed) hideAnnotations();
                        else {

                            const sprites = getAllSprites(scene, true);

                            sprites.forEach(sprite => {

                                if (sprite.name === i) {
                                    const target = new THREE.Vector3();
                                    const vector = sprite.getWorldPosition(target);
                                    goToAnnotation(i - 1, vector, undefined);  // goToAnnotation(i - 1, intersects[0].point, undefined);
                                }

                            });

                        }

                    }
                });

                // double click event - reset camera position and hide
                renderer.domElement.addEventListener("dblclick", function(event) {
                    hideAnnotations();
                    changeCameraPosition(event, raycaster);
                });

                // "controller" is different from "mouse" events - "select" is a generic interaction
                controller.addEventListener('select', () => {

                    tempMatrix.identity().extractRotation(pointer.matrixWorld);

                    let raycaster = new THREE.Raycaster();
                    raycaster.camera = renderer.xr.getCamera().cameras[0];
                    raycaster.ray.origin.setFromMatrixPosition(pointer.matrixWorld);
                    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

                    // intersect with annotations
                    // select all sprites
                    let allAnnotations = getAllSprites(scene);

                    let intersects = raycaster.intersectObjects(allAnnotations);

                    if (intersects.length > 0) {

                        const i = intersects[0].object.name;

                        annotationIsDisplayed && i === annotationDisplayed
                            ? hideAnnotations()
                            : goToAnnotation(i - 1, intersects[0].point, undefined);

                        return;

                    }

                    // intersect with entity links - only for Hololens
                    if (!renderer.xr.getSession().domOverlayState) {
                        intersects = raycaster.intersectObjects(planesArray);
                        if (intersects.length > 0) {
                            const uv = intersects[0].uv;
                            const canvasX = uv.x * canvasXR.width;
                            const canvasY = (1 - uv.y) * canvasXR.height; // inverse Y for Three.js

                            for (const area of clickableAreas) {
                                if (
                                    canvasX >= area.x &&
                                    canvasX <= area.x + area.width &&
                                    canvasY >= area.y &&
                                    canvasY <= area.y + area.height
                                ) {
                                    window.open(area.url, '_blank');
                                    break;
                                }
                            }
                        }
                    }

                });

                // "selectstart" is the first moment of the interaction
                controller.addEventListener('selectstart', () => {

                    // get session
                    const session = renderer.xr.getSession();

                    tempMatrix.identity().extractRotation(pointer.matrixWorld);

                    let raycaster = new THREE.Raycaster();
                    raycaster.camera = renderer.xr.getCamera().cameras[0];
                    raycaster.ray.origin.setFromMatrixPosition(pointer.matrixWorld);
                    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

                    let intersects = raycaster.intersectObject(modelScene);

                    if (intersects.length > 0) {

                        selectedObject = intersects[0].object;

                        // check if the device supports hands such as Hololens
                        if (event.inputSource.handedness) {
                            // get hand - right to move, left to rotate
                            activeHandedness = event.inputSource.handedness;
                        }

                        // dragging for Hololens and non-Hololens devices
                        if (activeHandedness === 'right' || isTouch) {
                            controller.getWorldPosition(initialControllerPosition);
                            isDragging = true;
                        } else if (activeHandedness === 'left') isRotating = true;

                    }

                });

                controller.addEventListener('selectend', () => {
                    isDragging = false;
                    selectedObject = null;
                    isRotating = false;
                    activeHandedness = null;
                });

                // show the content and hide the loader
                document.getElementById('top-right-container').style.display = 'flex';
                document.getElementById('canvas-scene').style.visibility = 'visible';
                if (isCustomAnn) document.getElementById('grid-container').style.visibility = 'visible';
                hideLoader();

            }

            // end sketchfab API
            // end viewer

            // end annotations

            // remove the extracted glb file after everything is loaded
            const formData = new FormData();
            formData.append('filePath', './3D_models/' + username + '/' + modelName.slice(0, -4) + '.glb'); // ensure that the glb file will be removed in any case

            await fetch('./PHP/removeGLB.php?nocache=' + new Date().getTime(), {
                method: 'POST',
                body: formData
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`Error removing the GLB file: ${response.status}`);
                }
                return response.text();
            }).then(data => {
                const parsedData = JSON.parse(data);
                if (parsedData.status === 'success') {
                    console.log(parsedData.message);
                } else if (parsedData.status === 'error') {
                    console.error(parsedData.message);
                }
            });

        });
        // end of model loading

        // set the scene size when the window is resized by the user
        window.addEventListener("resize", onWindowResize, false);

    }

    function onWindowResize() {
        // resize body
        document.body.style.width = `${window.innerWidth}px`;
        document.body.style.height = `${window.innerHeight}px`;

        // resize camera
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        // resize renderer
        setSceneSize(renderer);

    }

    // this function is called constantly at runtime
    function animate() {

        if (isDragging) {

            const controllerWorldPosition = new THREE.Vector3();
            controller.getWorldPosition(controllerWorldPosition);
            const delta = new THREE.Vector3().subVectors(controllerWorldPosition, initialControllerPosition);

            // apply a scale factor for non-HoloLens devices
            const session = renderer.xr.getSession();
            if (session) {

                // 3D scene
                if (session.domOverlayState) {

                    const scaleFactor = 4.5;
                    modelScene.position.add(delta.multiplyScalar(scaleFactor));

                } else {
                    // AR scene

                    if (selectedObject !== null) {
                        if (selectedObject.name === "planeFront" || selectedObject.name === "planeBack") {  // if annotation is dragged

                            const parentPosition = selectedObject.parent.position;
                            parentPosition.add(delta); // select the THREE.Group parent of the single plane

                        } else {

                            modelScene.position.add(delta);

                        }
                    }

                }
            }
            initialControllerPosition.copy(controllerWorldPosition);

        } else if (isRotating) {

            const controllerWorldPosition = new THREE.Vector3();
            controller.getWorldPosition(controllerWorldPosition);
            const delta = new THREE.Vector3().subVectors(controllerWorldPosition, initialControllerPosition);

            // apply a scale factor for non-HoloLens devices
            const session = renderer.xr.getSession();
            if (session) {

                if (!session.domOverlayState) { // for Hololens

                    if (selectedObject !== null) {

                        // weight of the model when the user rotates it
                        const rotationSpeed = 0.3;
                        const deltaRotX = -delta.y * rotationSpeed; // 0.3 is the rotation speed - slow
                        const deltaRotY = delta.x * rotationSpeed;

                        if (selectedObject.name === "planeFront" || selectedObject.name === "planeBack") {  // if the user rotate the annotation only the annotation rotates...

                            selectedObject.parent.rotation.x = THREE.MathUtils.lerp(    // select the THREE.Group parent of the single plane and apply smoothing
                                selectedObject.parent.rotation.x,
                                selectedObject.parent.rotation.x + deltaRotX,
                                0.5
                            );

                            selectedObject.parent.rotation.y = THREE.MathUtils.lerp(    // select the THREE.Group parent of the single plane and apply smoothing
                                selectedObject.parent.rotation.y,
                                selectedObject.parent.rotation.y + deltaRotY,
                                0.5
                            );

                        } else {    // ... otherwise rotate the entire scene

                            modelScene.rotation.x = THREE.MathUtils.lerp(
                                modelScene.rotation.x,
                                modelScene.rotation.x + deltaRotX,
                                0.5
                            );

                            modelScene.rotation.y = THREE.MathUtils.lerp(
                                modelScene.rotation.y,
                                modelScene.rotation.y + deltaRotY,
                                0.5
                            );

                        }
                    }

                }

            }

        }

        // necessary to keep the controls alive
        controls.update();
        render();

    }

    function render() {

        let xr = renderer.xr.isPresenting;

        // only for HoloLens
        if (xr && !renderer.xr.getSession().domOverlayState) updateLaserColorOnHover(controller, laser);

        renderer.render(scene, camera);

        if (xr) label3DRenderer.render(scene, camera);

        if (annotationIsDisplayed) updateScreenPosition(xr);

    }

    function hasEvents(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return false;
        }

        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    return true;
                }
            }
        }

        return Object.keys(obj).length > 0;
    }

    // for HoloLens
    function updateLaserColorOnHover(controller, laserMesh) {

        const sprites = getAllSprites(scene);
        const raycaster = new THREE.Raycaster();
        const tempMatrix = new THREE.Matrix4();

        tempMatrix.identity().extractRotation(controller.matrixWorld);

        raycaster.camera = renderer.xr.getCamera().cameras[0];
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const intersects = raycaster.intersectObjects(sprites, false);

        if (intersects.length > 0) {
            // hover -> red
            laserMesh.material.color.set(0xff0000);
        } else {
            // default -> white
            laserMesh.material.color.set(0xffffff);
        }

    }

    // screen position of the annotations
    function updateScreenPosition(isXR) {

        let thisCamera;

        isXR
            ? thisCamera = renderer.xr.getCamera(camera)
            : thisCamera = camera;

        const canvas = renderer.domElement;
        const sprites = getAllSprites(scene, true);

        // re-order sprites to match the annotation list order in DOM
        sprites.sort((a, b) => a.name - b.name);

        for (let i=0; i < sprites.length; i++) {
            const target = new THREE.Vector3();
            let vector = sprites[i].getWorldPosition(target);

            vector.project(thisCamera);

            vector.x = Math.round((0.5 + vector.x / 2) * (canvas.width / window.devicePixelRatio));
            vector.y = Math.round((0.5 - vector.y / 2) * (canvas.height / window.devicePixelRatio));

            annotationList[i].style.top = `${vector.y}px`;
            annotationList[i].style.left = `${vector.x}px`;

            let newMargin = vector.x * zoomLevel * 0.5; // vector.x * zoomLevel;
            annotationList[i].style.marginTop = `${newMargin}px`;
            annotationList[i].style.marginLeft = `${newMargin}px`;

            if (isXR) {

                annotationList[i].style.transform = `translate(-50%, -50%) translate(${vector.x/1.2}px, ${vector.y/3}px)`;
                annotationList[i].style.width = '85%';
                annotationList[i].style.maxWidth = 'none';

            } else {

                let containerRect;

                isCustomAnn
                    ? containerRect = document.querySelector('#scene-container canvas').getBoundingClientRect()
                    : containerRect = document.getElementById('index-container').getBoundingClientRect();

                annotationList[i].style.transform = 'none';

                const elemRect = annotationList[i].getBoundingClientRect();

                if (elemRect.bottom !== 0) annotationList[i].style.height = `${containerRect.bottom - elemRect.top}px`;
                if (elemRect.right !== 0) annotationList[i].style.width = `${containerRect.right - elemRect.left}px`;

                annotationList[i].style.maxWidth = 'fit-content';

            }
        }

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        if ((canvas.width !== width || canvas.height !== height) && !isXR) {
            setSceneSize(renderer);
            thisCamera.aspect = width / height;
            thisCamera.updateProjectionMatrix();
        }
    }

    // zoom level
    function getControlsZoom() {
        if (originalDistance == null) originalDistance = controls.getDistance();

        zoomLevel = originalDistance / controls.getDistance();
        zoomLevel = Math.round(zoomLevel * 1e4) / 1e4;
        zoomLevel /= 150;

    }

    function changeCameraPosition(e, raycaster) {
        raycaster.setFromCamera(
            {
                x: (e.clientX / renderer.domElement.clientWidth) * 2 - 1,
                y: -(e.clientY / renderer.domElement.clientHeight) * 2 + 1
            },
            camera
        );

        const intersects = raycaster.intersectObject(modelScene, true);

        if (intersects.length > 0) {

            const p = intersects[0].point;

            gsap.to(controls.target, {
                duration: 0.5,
                x: p.x,
                y: p.y,
                z: p.z,
                ease: "power3.out"
            });

        } else {    // if click is outside the model restore the default camera position and target

            gsap.to(camera.position, {
                duration: 0.5,
                x: defaultCameraPosition.x,
                y: defaultCameraPosition.y,
                z: defaultCameraPosition.z,
                ease: "power3.out",
                onUpdate: () => {
                    camera.lookAt(modelCenter);
                }
            });

            gsap.to(controls.target, {
                duration: 0.5,
                x: modelCenter.x,
                y: modelCenter.y,
                z: modelCenter.z,
                ease: "power3.out"
            });

        }
    }

    function saveNewSketchfabNarrative(annotations) {

        const events = json_data.events;

        // define and insert a new event for each annotation
        annotations.forEach(annotation => {
            events[annotation.id] = {
                "_id": annotation.id,
                "end": "",
                "date": "",
                "text": {
                    "headline": annotation.title,
                    "text": ""
                },
                "type": "no type",
                "props": {},
                "start": "",
                "title": annotation.title,
                "objurl": [],
                "source": "",
                "end_date": {
                    "day": "",
                    "year": null,
                    "month": ""
                },
                "formType": "sketchfab",
                "location": {
                    "name": "",
                    "lat": null,
                    "lon": null,
                    "zoom": null,
                    "line": null
                },
                "position": annotation.index,
                "unique_id": "",
                "eventMedia": "",
                "eventVideo": "",
                "start_date": {
                    "day": "",
                    "year": null,
                    "month": ""
                },
                "description": "",
                "sketchfabidmodel": modelID,
                "eventMediaCaption": "",
                "eventVideoCaption": "",
                "annotationNumber3DModel": String(annotation.index),
                'coordinates': annotation.coordinates,
                'cameraPosition': annotation.cameraPosition,
                'modelName': modelName.slice(0, -4) + '.glb'
            };
        });

        saveJson(modelName, json_data);
    }

    function onSelectStart(event) {
        pointer = event.target;
    }

    function onSelectEnd(event) {
        pointer = undefined;
    }

    // between 3D and AR
    function switchScene() {

        hideAnnotations();

        const isImmersiveAR = renderer.xr.isPresenting;

        if (modelScene) {

            if (isImmersiveAR) {

                const arScaleFactor = 0.6;
                modelScene.scale.set(scale * arScaleFactor, scale * arScaleFactor, scale * arScaleFactor);

                modelScene.position.x = -modelSceneCenter.x;
                modelScene.position.y = -modelSceneCenter.y;
                modelScene.position.z = modelSceneCenter.z - (cameraZ * arScaleFactor);

            } else {

                model.position.set(0, 0, 0);

                // reset modelScene position
                modelScene.position.x = -modelSceneCenter.x;
                modelScene.position.y = -modelSceneCenter.y;
                modelScene.position.z = -modelSceneCenter.z;

                modelScene.scale.set(scale, scale, scale);

            }

            model.position.set(0, 0, 0);
            modelScene.updateMatrixWorld();

        }

    }

    function setupARGestures() {
        const domElement = label3DRenderer.domElement;
        let touchStartDistance = 0;
        let touchStartX = 0;
        let touchStartY = 0;

        function getDistance(t1, t2) {
            const dx = t2.clientX - t1.clientX;
            const dy = t2.clientY - t1.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function onTouchStart(e) {
            const count = e.touches.length;
            if (count === 2) {
                touchStartDistance = getDistance(e.touches[0], e.touches[1]);
                isZooming = true;
            } else if (count === 3) {
                isRotatingTouch = true;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }

        function onTouchMove(e) {
            if (isZooming && e.touches.length === 2) {
                const newDistance = getDistance(e.touches[0], e.touches[1]);
                const zoomFactor = newDistance / touchStartDistance;
                model.scale.setScalar(model.scale.x * zoomFactor);
                touchStartDistance = newDistance;
            }
            if (isRotatingTouch && e.touches.length === 3) {
                const dx = e.touches[0].clientX - touchStartX;
                const dy = e.touches[0].clientY - touchStartY;
                model.rotation.y += dx * 0.005;
                model.rotation.x += dy * 0.005;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }

        function onTouchEnd(e) {
            if (e.touches.length < 2) isZooming = false;
            if (e.touches.length < 3) isRotatingTouch = false;
        }

        domElement.addEventListener('touchstart', onTouchStart);
        domElement.addEventListener('touchmove', onTouchMove);
        domElement.addEventListener('touchend', onTouchEnd);

        return () => {
            domElement.removeEventListener('touchstart', onTouchStart);
            domElement.removeEventListener('touchmove', onTouchMove);
            domElement.removeEventListener('touchend', onTouchEnd);
        };
    }

    function setSceneSize(renderer) {
        if (renderer) {
            // if the page is the custom annotation one, set renderer size less than window width
            if (isCustomAnn) {
                const width = document.getElementById('scene-container').clientWidth;
                const height = document.getElementById('scene-container').clientHeight;

                renderer.setSize(width, height);
            } else {
                renderer.setSize(window.innerWidth, window.innerHeight);
            }
        }
    }

    console.log("initXR result:", initXR());

}

function setDefaultCameraPosition() {
    const box = new THREE.Box3().setFromObject(modelScene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraDistance = maxDim / (2 * Math.tan(fov / 2));
    cameraDistance *= 0.85;

    let position = new THREE.Vector3();

    // Decide the dominant direction to set the view
    if (size.y < size.x && size.y < size.z) {
        // Low altitude --> top view (map)
        position.set(center.x, center.y + cameraDistance, center.z);
    } else if (size.z > size.x && size.z > size.y) {
        // Deeper in Z --> front view on Z
        position.set(center.x, center.y, center.z + cameraDistance);
    } else {
        // Generic case: isometric view
        position.set(center.x + cameraDistance, center.y + cameraDistance, center.z + cameraDistance);
    }

    return position;
}

function hideAnnotations () {
    let annotationsToHide;

    // 3D scene
    annotationsToHide = model.children.filter(child => child.isCSS2DObject);
    annotationsToHide.forEach(function (el) {
        el.visible = false;
    });

    // XR non-Hololens
    annotationsToHide = model.children.filter(child => child.isCSS3DObject);
    annotationsToHide.forEach(function (el) {
        el.visible = false;
    });

    // XR Hololens
    //annotationsToHide = modelScene.children.filter(child => child.isGroup);
    annotationsToHide = modelScene.children.filter(child => child.isGroup);
    annotationsToHide.forEach(function (el) {
        el.visible = false;
    });

    // XR Hololens
    annotationMeshList.forEach(function (meshGroup) {
        meshGroup.visible = false;
    });

    // hide elements in DOM
    const labels = document.querySelectorAll('#label-renderer .annotation');
    labels.forEach((label) => {
        label.style.display = 'none';
    });

    annotationIsDisplayed = false;
    annotationDisplayed = null;

    // reset canvas
    document.querySelectorAll('canvas.number').forEach(canvas => canvas.remove());

    // reset all sprite borders
    let allSprites = getAllSprites(scene);
    allSprites.forEach(annotation => {
        changeCanvasColor(annotation, 'white');
    });

}

function getRandom13DigitNumber() {
    const min = 10n ** 12n; // 1 followed by 12 zeros
    const max = (10n ** 13n) - 1n; // 1 followed by 13 zeros minus 1
    return BigInt(Math.floor(Math.random() * Number(max - min + 1n)) + Number(min));
}

// sync scene (changes and theme) in all windows - only those with the same session and model
function refreshViewer() {
    localStorage.setItem('updateFromCustomAnn' + modelName, Date.now());
}

// change theme - called when the user clicks on the toggle button
function refreshTheme(theme) {
    localStorage.setItem(theme + '-' + modelName, Date.now());
}

function applyTheme(theme) {

    try {
        const toggle = document.getElementById('theme-toggle');
        const slider = document.getElementById('theme-slider');
        const body = document.body;
        const infoButton = document.getElementById('help-icon');
        const customAnnotationsButton = document.getElementById('custom-annotations');
        const ARButton = document.getElementById('ARButton');
        const annotationsPanel = document.getElementById('annotationsPanel');
        const btnSecondaryPanel = annotationsPanel.querySelectorAll('li button.btn-secondary');
        const annotations = document.querySelectorAll('.annotation');

        if (theme === 'light') {

            body.classList.add('theme-light');
            body.classList.remove('theme-dark');
            toggle.checked = true;
            if (typeof renderer !== 'undefined') renderer.domElement.style.backgroundPosition = 'bottom';
            infoButton.style.color = 'black';
            slider.style.background = '#4a4a4a';
            annotations.forEach(annotation => {
                annotation.style.color = 'white';
                annotation.style.background = 'rgba(0, 0, 0, 0.8)';
            });

            if (!isCustomAnn) {

                customAnnotationsButton.style.color = 'white';
                customAnnotationsButton.style.backgroundColor = 'black';
                customAnnotationsButton.style.borderColor = 'black';

                ARButton.style.color = 'white';
                ARButton.style.backgroundColor = 'black';
                ARButton.style.borderColor = 'black';

                annotationsPanel.classList.remove('annotationsPanel-dark');

                btnSecondaryPanel.forEach(button => {
                    button.classList.remove('btn-secondary-dark');
                })

            }

        } else {

            body.classList.add('theme-dark');
            body.classList.remove('theme-light');
            toggle.checked = false;
            if (typeof renderer !== 'undefined') renderer.domElement.style.backgroundPosition = 'top';
            infoButton.style.color = 'whitesmoke';
            slider.style.background = '#b8b8b8';
            annotations.forEach(annotation => {
                annotation.style.color = 'black';
                annotation.style.background = 'rgba(255, 255, 255, 0.8)';
            });

            if (!isCustomAnn) {

                customAnnotationsButton.style.color = 'white';
                customAnnotationsButton.style.background = 'rgba(0, 0, 0, 0.1)';
                customAnnotationsButton.style.borderColor = 'white';

                ARButton.style.color = 'white';
                ARButton.style.background = 'rgba(0, 0, 0, 0.1)';
                ARButton.style.borderColor = 'white';

                annotationsPanel.classList.add('annotationsPanel-dark');

                btnSecondaryPanel.forEach(button => {
                    button.classList.add('btn-secondary-dark');
                })

            }

        }
    } catch (e) {
        console.log(e);
    }

}

// add new annotation as event in the json file - function to memorize and save changes
async function saveJSONAnnotations(refresh=false) {

    // show loading icon
    showLoader();

    // if session is expired redirect to the login page
    await fetch('./PHP/checkSession.php?nocache=' + new Date().getTime())
        .then(res => res.json())
        .then(async function (data) {

            if (data.loggedIn) {

                // insert here
                const eventID = document.getElementById('event-id').value;
                const events = json_data.events;

                // data validation when user clicks on "Save" button
                if ((eventID in events) && !checkData()) {

                    showAlert('validation', 'Changes not saved. Please check the information carefully.', 'warning', 1500);

                } else {

                    try {

                        const position = document.getElementById('position').value;

                        // if it is a new event
                        if (!(eventID in events)) {

                            // if it is the first event then set newPosition to 1, otherwise add 1 to the last one
                            let newPosition;
                            positionsOriginal.length > 0 ? newPosition = Math.max(...positionsOriginal) + 1 : newPosition = 1;

                            events[eventID] = {
                                "_id": "",
                                "end": "",
                                "date": "",
                                "text": {
                                    "headline": "",
                                    "text": ""
                                },
                                "type": "no type",
                                "props": {},
                                "start": "",
                                "title": "",
                                "objurl": [],
                                "source": "",
                                "end_date": {
                                    "day": "",
                                    "year": null,
                                    "month": ""
                                },
                                "formType": "sketchfab",
                                "location": {
                                    "name": "",
                                    "lat": null,
                                    "lon": null,
                                    "zoom": null,
                                    "line": null
                                },
                                "position": newPosition,   // add 1 to the highest annotation number
                                "unique_id": "",
                                "eventMedia": "",
                                "eventVideo": "",
                                "start_date": {
                                    "day": "",
                                    "year": null,
                                    "month": ""
                                },
                                "description": "",
                                "sketchfabidmodel": "",
                                "eventMediaCaption": "",
                                "eventVideoCaption": "",
                                "annotationNumber3DModel": "",
                                'coordinates': null,
                                'cameraPosition': null,
                                'modelName': modelName.slice(0, -4) + '.glb'
                            };

                            positionsOriginal = extractPositions(json_data.events);
                            positionsNormalized = normalizePositions(positionsOriginal);

                        }

                        // get information
                        const title = document.getElementById('title').value;
                        const description = document.getElementById('description').value;
                        const coordinates = document.getElementById('coordinates').value;
                        const oldPosition = document.getElementById('old-position').textContent;
                        const cameraPosition = document.getElementById('camera-position').textContent;

                        // get digital objects
                        let arrayDigObj = [];
                        const digobjTable = document.getElementById('digobj-table');
                        for (let child of digobjTable.childNodes) {
                            const childUrl = child.querySelector('.digobj-preview').getAttribute('data-url');
                            const childTitle = child.querySelector('.truncated-value').getAttribute('data-original-title');
                            arrayDigObj.push({
                                'url': childUrl,
                                'title': childTitle
                            });
                        }

                        const annotationScene = document.querySelector('.annotation[data-before=\"' + oldPosition + '\"]');
                        const annotationDescription = annotationScene.querySelector('.annotation-description');

                        // save information in json_data
                        events[eventID]._id = eventID;
                        events[eventID].text.headline = title;
                        events[eventID].title = title;
                        events[eventID].formType = 'sketchfab';
                        events[eventID].description = description; // pure text
                        if (events[eventID].sketchfabidmodel === "") events[eventID].sketchfabidmodel = modelUID;

                        // digital objects
                        if (arrayDigObj.length > 0) {

                            events[eventID].objurl = []; // reset digital objects of the event

                            for (let i = 0; i < arrayDigObj.length; i++) {
                                events[eventID].objurl.push({
                                    'url': arrayDigObj[i].url,
                                    'title': arrayDigObj[i].title
                                });
                            }

                        }

                        // entities
                        const props_temp_object = Object.fromEntries(props_temp);
                        const keys = Object.keys(props_temp_object);
                        for (let key of keys) {
                            if (!key in event_entities) event_entities[key] = props_temp_object[key];
                        }

                        // update global entities variable
                        json_data.entities = event_entities;

                        // props
                        events[eventID].props = Object.fromEntries(props_temp);

                        // HTML description
                        events[eventID].text.text = await addHTMLDescription(events[eventID].description, events[eventID].props, events[eventID].objurl); // with HTML code

                        // convert coordinates string to a vector
                        const coordinatesVector = coordinates.split(',');
                        events[eventID].coordinates = new THREE.Vector3(
                            parseFloat(coordinatesVector[0]),
                            parseFloat(coordinatesVector[1]),
                            parseFloat(coordinatesVector[2])
                        );

                        // convert cameraPosition string to a vector
                        const cameraVector = cameraPosition.split(',');
                        events[eventID].cameraPosition = new THREE.Vector3(
                            parseFloat(cameraVector[0]),
                            parseFloat(cameraVector[1]),
                            parseFloat(cameraVector[2])
                        );

                        // update object 3D and 2D content
                        // update title and description
                        annotationScene.querySelector('.annotation-title').textContent = title;
                        if (events[eventID].text.text.trim() !== '<p></p>') annotationDescription.innerHTML = events[eventID].text.text;  // if paragraph is not empty insert HTML code instead of pure text
                        else annotationDescription.innerHTML = '';  // otherwise empty HTML
                        // swap 'data-before' attribute values
                        if (position !== oldPosition) {
                            const newAnnotationScene = document.querySelector('.annotation[data-before=\"' + position + '\"]');
                            annotationScene.setAttribute('data-before', position);
                            newAnnotationScene.setAttribute('data-before', oldPosition);
                        }

                        // change annotation-index value
                        const annotationsContainer = document.getElementById('annotations-container');
                        const oldAnnotation = annotationsContainer.querySelector('.annotation-item[annotation-number=\"' + oldPosition + '\"]');
                        const newAnnotation = annotationsContainer.querySelector('.annotation-item[annotation-number=\"' + position + '\"]');
                        newAnnotation.querySelector('.annotation-index').textContent = oldPosition;
                        oldAnnotation.querySelector('.annotation-index').textContent = position;

                        updateAnnotationListOrder(annotationsContainer);

                        // update annotation title in list
                        oldAnnotation.querySelector('.annotation-name').textContent = title;

                        // update digital object global variables
                        json_data.events[eventID].objurl = []; // reset digital objects of the event
                        if (arrayDigObj.length > 0) {

                            for (let i = 0; i < arrayDigObj.length; i++) {
                                json_data.events[eventID].objurl.push({
                                    'url': arrayDigObj[i].url,
                                    'title': arrayDigObj[i].title
                                });
                            }

                        }

                        // update events order
                        if (position !== oldPosition) {
                            const entries = Object.entries(events);
                            for (let i = 0; i < entries.length; i++) {
                                if (eventID === String(entries[i][0])) {
                                    for (let j = 0; j < entries.length; j++) {
                                        if (getNormalizedValue(entries[j][1].position) === parseInt(position)) {
                                            swapPositionValues(events, entries[j][1]._id, entries[i][1]._id);
                                        }
                                    }
                                }
                            }

                            positionsOriginal = extractPositions(json_data.events);
                            positionsNormalized = normalizePositions(positionsOriginal);

                            // delete sprites and annotations from list
                            removeAnnotations(annotationMeshList, annotationIsDisplayed);
                            annotationsContainer.innerHTML = '';
                            document.getElementById('annotation-list-div').innerHTML = '';
                            document.querySelectorAll('canvas.number').forEach(canvas => canvas.remove());
                            numberOfCanvas = 0;
                            annotationList = [];

                            // re-insert annotations in list and sprites
                            reloadAnnotations(sketchfabAnnotations);

                        }

                        // resize description textarea
                        setTextareaHeight(document.getElementById('description'));

                        // save file
                        saveJson(modelName, json_data, false);

                        // update old position with current one
                        document.getElementById('old-position').textContent = position;

                        // disable "save" button
                        document.getElementById('save-annotation').disabled = true;

                        // reset any errors in UI
                        resetErrors();

                        // display alert
                        showAlert('annotation-saved', 'Changes saved successfully!', 'success', 1500);

                        if (refresh) refreshViewer();

                    } catch (e) {
                        showAlert('error', 'Error:' + e, 'danger', 2000);
                        console.error('Error saving JSON file:', e);
                    }

                }

            } else {

                showModal(
                    true,
                    'Session expired',
                    'Please login again.',
                    undefined,
                    'OK',
                    function() {
                    },
                    function() {
                        window.location.href = './index.html';
                    }
                );

            }

        })
        .catch(err => {

            console.error('Error during session check:', err);

            showModal(
                true,
                'Session check error',
                'Unable to check session. Please check your internet connection.',
                undefined,
                'OK',
                function() {
                },
                function() {
                }
            );

        });

    hideLoader();

}

// save json file - check session
function saveJson(modelName, json_data, check_session = true) {

    if (check_session) {

        // if session is expired redirect to the login page
        fetch('./PHP/checkSession.php?nocache=' + new Date().getTime())
            .then(res => res.json())
            .then(async function (data) {

                if (data.loggedIn) {

                    fetchJson(modelName, json_data);

                } else {

                    showModal(
                        true,
                        'Session expired',
                        'Please login again.',
                        undefined,
                        'OK',
                        function() {
                        },
                        function() {
                            window.location.href = './index.html';
                        }
                    );

                }

            })
            .catch(err => {

                console.error('Error during session check:', err);

                showModal(
                    true,
                    'Session check error',
                    'Unable to check session. Please check your internet connection.',
                    undefined,
                    'OK',
                    function() {
                    },
                    function() {
                        hideLoader();
                    }
                );

            });

    } else fetchJson(modelName, json_data);

}

// save json file
function fetchJson(modelName, json_data) {

    const jsonToSave = JSON.stringify({
        fileName: modelName.slice(0, -4) + '.json',
        data: JSON.stringify(json_data, null, 2)
    });
    fetch('./PHP/saveJson.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: jsonToSave
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                console.log(result.message);
            } else {
                console.error(result.message);
            }
        })
        .catch(error => {
            console.error("Error saving JSON file:", error);
        });

}

// refresh annotations
function reloadAnnotations(annotations, refresh=false) {
    const events = sortEntries(Object.entries(json_data.events), positionsOriginal, positionsNormalized);

    let annotationListTemp = [];    // temporary list for sorting annotations

    const modelNameGlb = modelName.slice(0, -4) + '.glb';

    if (annotations) {

        annotations.forEach(function (ann) {

            let index = annotations.indexOf(ann);

            for (let i = 0; i < events.length; i++) {
                if ('annotationNumber3DModel' in events[i][1] && parseInt(events[i][1].annotationNumber3DModel) === index + 1) {
                    let description;
                    if (events[i][1].text.text.trim() !== '<p></p>') description = events[i][1].text.text;    // avoid empty paragraph
                    else description = '';

                    // Get coordinates of the annotation (x, y, z)
                    let thisCoors = new THREE.Vector3(
                        ann.position[0],
                        ann.position[1],
                        ann.position[2]
                    );

                    let thisAnn;

                    if ("coordinates" in events[i][1]) {
                        if (thisCoors.equals(events[i][1].coordinates)) {
                            thisAnn = thisCoors;
                        }
                        else {
                            const coordinatesVector = events[i][1].coordinates;
                            thisAnn = new THREE.Vector3(
                                parseFloat(coordinatesVector.x),
                                parseFloat(coordinatesVector.y),
                                parseFloat(coordinatesVector.z)
                            );
                        }
                    } else {
                        thisAnn = thisCoors;
                    }

                    annotationListTemp.push({
                        index: positionsNormalized[positionsOriginal.indexOf(parseInt(events[i][1].position))],
                        title: events[i][1].title,
                        description: description,
                        coordinates: thisAnn,
                        modelName: modelNameGlb,
                        id: events[i][1]._id
                    });
                }
            }
        });

    }

    events.forEach(([key, value]) => {
        if (key.includes('customAnnotation')) {
            let title = value.text.headline;

            let description;
            if (value.text.text.trim() !== '<p></p>') description = value.text.text;    // avoid empty paragraph
            else description = '';

            let coordinates = new THREE.Vector3(
                value.coordinates.x,
                value.coordinates.y,
                value.coordinates.z
            );

            annotationListTemp.push({
                index: positionsNormalized[positionsOriginal.indexOf(parseInt(value.position))],
                title: title,
                description: description,
                coordinates: coordinates,
                modelName: modelNameGlb,
                id: value._id
            });
        }
    });

    annotationListTemp.sort((a, b) => positionsNormalized.indexOf(a.index) - positionsNormalized.indexOf(b.index));
    annotationListTemp.sort((a, b) => a.index - b.index);

    // if refresh the scene in scene.html then reset the annotationsPanel list
    let ulAnn;
    if (refresh) {
        ulAnn = document.querySelector('#annotation-list');
        ulAnn.innerHTML = '';
    }

    if (annotationListTemp.length > 0) {

        annotationListTemp.forEach((ann, index) => {

            // create DOM element
            createAnnotationDOM(ann.title, ann.description, index + 1, ann.coordinates, annotationListDiv);

            // Number
            let annotationCanvas = createCanvas(index);
            numberOfCanvas++;

            // Sprites - circles and numbers
            const spriteFront = createSprite(annotationCanvas, ann.coordinates, index);

            // annotations list - only if called from customAnn.html
            if (!refresh) addAnnotationToList(ann.title, index + 1, ann.coordinates, ann.id);
            // if in scene.html re-insert annotations in annotationsPanel (quick links)
            else appendButtonToPanel(index, spriteFront, renderer, ann.title, ulAnn, ann.cameraPosition);

        });
        if (!isCustomAnn) annotationsPanel.style.display = 'block';

    } else annotationsPanel.style.display = 'none';

    // if it is not the customAnn.html page, set the style of the panel
    if (!isCustomAnn) {

        const annotationsPanel = ulAnn.parentElement;

        if (ulAnn.scrollHeight > annotationsPanel.clientHeight) annotationsPanel.style.overflowY = 'scroll';
        else annotationsPanel.style.overflowY = 'initial';

    }

}

function appendButtonToPanel(index, spriteFront, renderer, title, ulAnn, cameraPosition) {
    const li = document.createElement('li');
    const liAnn = ulAnn.appendChild(li);
    const button = document.createElement('button');
    button.className = 'annotationButton';
    button.classList.add('btn-secondary');
    button.setAttribute('original-title', `${index + 1} : ${title}`);
    button.addEventListener('mousedown', function () {
        spriteFront.updateMatrixWorld();
        let target = new THREE.Vector3();

        goToAnnotation(index, spriteFront.getWorldPosition(target), cameraPosition);
    });
    liAnn.appendChild(button);
    // adjust text if it exceeds boundary
    truncateTextToFitAll();
}

// this function handles annotation interactions
function goToAnnotation(i, point, cameraPosition) {

    // first of all, hide all annotations
    hideAnnotations();

    const name = i+1;
    const isXR = renderer.xr.isPresenting;

    annotationIsDisplayed = true;
    annotationDisplayed = name;

    if (!isXR) {
        let all2DAnnotations = model.children.filter(child => child.isCSS2DObject);

        // find the annotation from json if cameraPosition is undefined
        if (!cameraPosition) {

            let thisPosition;
            let positionFound = false;

            // search from normalized positions
            const events = sortEntries(Object.entries(json_data.events), positionsOriginal, positionsNormalized);
            events.forEach(([key, value]) => {

                if (name === getNormalizedValue(value.position)) thisPosition = value.cameraPosition;
                if (thisPosition) {
                    cameraPosition = thisPosition;
                    positionFound = true;
                }

            });

            const defaultCamera = setDefaultCameraPosition();

            if (!positionFound) cameraPosition = new THREE.Vector3(
                defaultCamera.x,
                defaultCamera.y,
                defaultCamera.z
            );

        }

        gsap.to(camera.position, {
            duration: 0.5,
            x: cameraPosition.x,
            y: cameraPosition.y,
            z: cameraPosition.z,
            ease: "power3.out"
        });

        gsap.to(controls.target, {
            duration: 0.5,
            x: point.x,
            y: point.y,
            z: point.z,
            ease: "power3.out"
        });

        let allSprites = getAllSprites(scene);

        // show selected annotation - 3D scene
        all2DAnnotations.forEach(function (ann) {

            if (ann.name === String(name)) {
                // show annotation
                ann.visible = true;

                // ensure that visualization is always on top
                const element = document.querySelector(`[data-before="${name}"]`);
                const annotationDescriptionChildren = element.querySelector('.annotation-description').children;
                if (element) {
                    element.style.display = 'block'; // this is required for scrollTop to work properly
                    element.scrollTop = 0;

                    // remove margin-bottom from <p> if there are no entities and digital objects
                    if (annotationDescriptionChildren.length === 1 && annotationDescriptionChildren[0].tagName.toLowerCase() === 'p') {
                        console.log(annotationDescriptionChildren[0].style, annotationDescriptionChildren[0]);
                        annotationDescriptionChildren[0].style.marginBottom = '0';
                    } else if (annotationDescriptionChildren.length === 0) {
                        element.querySelector('.annotation-title').style.marginBottom = '0';
                    }

                    // if annotation is not found, then search it from 3D label-renderer - annotations opened in AR mode are moved from 2D label-renderer to 3D label-renderer
                    const annotationFrom3D = element.closest('#label-renderer-3d');
                    if (annotationFrom3D) label2DRenderer.domElement.appendChild(element);
                }

            }
        });

        // reset canvas
        document.querySelectorAll('canvas.number').forEach(canvas => canvas.remove());

        // highlight sprite of the selected annotation
        allSprites.forEach(annotation => {

            annotation.name === name
                ? changeCanvasColor(annotation, '#f50a0a')   // red sprite border - annotation selected
                : changeCanvasColor(annotation, 'white'); // white sprite border for other annotations

        });

    } else {

        let all3DAnnotations = model.children.filter(child => child.isCSS3DObject);

        // show selected annotation - AR scene
        all3DAnnotations.forEach(function (ann) {
            if (ann.name === String(name)) {
                if (renderer.xr.getSession().domOverlayState) {
                    ann.visible = true;
                } else {
                    let annotations = document.getElementById('annotation-list-div').childNodes;

                    for (let i=0; i<annotations.length; i++) {

                        let thisData = annotations[i].getAttribute('data-before');

                        if (thisData === String(name)) {

                            let annotationExists = false;
                            let thisAnn;

                            for (let y=0; y < modelScene.children.length; y++) {

                                if (modelScene.children[y].name === String(name)) {
                                    annotationExists = true;
                                    thisAnn = modelScene.children[y];
                                    thisAnn.visible = true;
                                }
                            }

                            if (!annotationExists) {

                                thisAnn = createAnnotationPlane(annotations[i], ann.name);
                                thisAnn.visible = true;

                            }
                        }
                    }
                }
            }
        });

    }

}

function removeAnnotations(annotationMeshList, annotationIsDisplayed) {
    scene.children = scene.children.filter(child => {
        if (child.isCSS2DObject) {
            child.parent.remove(child);
            return false;
        }
        return true;
    });

    model.children = model.children.filter(child => {
        if (child.isCSS2DObject) {
            child.parent.remove(child);
            return false;
        }
        return true;
    });

    scene.children = scene.children.filter(child => {
        if (child.isCSS3DObject) {
            child.parent.remove(child);
            return false;
        }
        return true;
    });

    model.children = model.children.filter(child => {
        if (child.isCSS3DObject) {
            child.parent.remove(child);
            return false;
        }
        return true;
    });

    scene.children = scene.children.filter(child => {
        if (child.isSprite) {
            child.parent.remove(child);
            return false;
        }
        return true;
    });

    model.children = model.children.filter(child => {
        if (child.isSprite) {
            child.parent.remove(child);
            return false;
        }
        return true;
    });

    annotationMeshList.forEach(meshGroup => {
        if (meshGroup.parent) {
            meshGroup.parent.remove(meshGroup);
        }
        scene.remove(meshGroup);
    });
    annotationMeshList.length = 0;

    annotationIsDisplayed = false;
}

function updateAnnotationListOrder(annotationsContainer) {
    const children = Array.from(annotationsContainer.children);
    children.sort((a, b) => {
        const firstValue = a.querySelector(".annotation-index").textContent.trim();
        const secondValue = b.querySelector(".annotation-index").textContent.trim();

        return firstValue.localeCompare(secondValue, undefined, {numeric: true});
    });
    children.forEach(child => annotationsContainer.appendChild(child));
}

// add content to annotation element in DOM
async function addHTMLDescription(description, props, digobjs) {

    let entitiesHTML = "";
    let digobjHTML = "";

    // retrieve entities from wikidata
    for (let key in props) {

        // sparql query
        await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&origin=*&search=${encodeURIComponent(key)}`)
            .then(response => response.json())
            .then(data => {

                let result = data.search[0];

                let entityTitle = result.label;
                let entityDescription = result.description;
                let entityURL = "https:" + result.url;

                if (entitiesHTML) entitiesHTML += " \u2022 ";

                entitiesHTML += `<a onmouseover='$(this).tooltip({boundary: "window"}); $(this).tooltip("show");' data-toggle='tooltip' title='${entityDescription}' target='_blank' href='${entityURL}'>${entityTitle}</a>`;

            })
            .catch(error => console.error("Error fetching data:", error))

    }

    // digital objects
    for (let i=0; i < digobjs.length; i++) {

        if (digobjHTML) digobjHTML += " \u2022 ";

        digobjHTML += `<a target='_blank' href='${digobjs[i].url}'>${digobjs[i].title}</a>`;

    }

    let string = `<p>${description}</p>`;

    if (entitiesHTML) string += `<h5>Entities</h5><span class='tl-entities'>${entitiesHTML}</span>`;
    if (digobjHTML) string += `<h5>Digital objects</h5><span class='digObjList'>${digobjHTML}</span>`;

    return string;
}

// download function - for download json button
function download(text, filename) {
    let pom = document.createElement("a");
    pom.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
    pom.setAttribute("download", filename);
    if (document.createEvent) {
        let event = document.createEvent("MouseEvents");
        event.initEvent("click", true, true);
        pom.dispatchEvent(event);
    } else {
        pom.click();
    }
}

function showAlert(id, message, level, time = 1000) {

    let alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${level} fade show`;
    alertDiv.setAttribute("id", id);
    alertDiv.setAttribute("role", "alert");
    alertDiv.innerHTML = `<span class='not-selectable'>${message}</span>`;

    let alertPlaceholder = document.getElementById("alert-placeholder");
    alertPlaceholder.innerHTML = "";
    alertPlaceholder.appendChild(alertDiv);

    alertDiv.style.display = "block";
    alertDiv.style.opacity = "1";

    if (time > 0) {
        setTimeout(() => {
            alertDiv.style.transition = "opacity 0.3s";
            alertDiv.style.opacity = "0";

            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.parentNode.removeChild(alertDiv);
                }
            }, 300)
        }, time);
    }

}

// function for annotation order
function extractPositions(container) {
    return Object.values(container).map(item => item.position);
}

// function for annotation order
function normalizePositions(originalPositions) {
    let sortedPositions = [...originalPositions].sort((a, b) => a - b);
    let positionMap = new Map(sortedPositions.map((pos, index) => [pos, index + 1]));
    return originalPositions.map(pos => positionMap.get(pos));
}

// values are normalized because "position" considers all types of events from SMBVT, while here we are only interested in 3D - function for annotation order
function getNormalizedValue(originalValue) {
    let index = positionsOriginal.indexOf(originalValue);
    return index !== -1 ? positionsNormalized[index] : null;
}

// swap annotation positions
function swapPositionValues(mainObject, key1, key2) {
    try {
        [mainObject[key1].position, mainObject[key2].position] = [mainObject[key2].position, mainObject[key1].position];
    } catch (e) {
        console.error("Error swapping positions: ", e);
    }
}

function computeAnnotationScale(referenceSprite) {
    let spriteScale = (1 / model.scale.x) * 0.1 * ((1 / scale) * 0.5);

    referenceSprite.scale.set(spriteScale, spriteScale, 1);
}

// element in the 3D and AR scenes - it represents the circle and the number of each annotation, together with canvas
function createSprite(canvas, point, number) {

    const annotationVector = new THREE.Vector3(point.x, point.y, point.z);
    const numberTexture = new THREE.CanvasTexture(canvas);

    const spriteMaterialFront = new THREE.SpriteMaterial({
        map: numberTexture,
        sizeAttenuation: false
    });

    let spriteFront = new THREE.Sprite(spriteMaterialFront);
    spriteFront.position.copy(annotationVector);

    computeAnnotationScale(spriteFront);

    spriteFront.name = number+1;
    spriteFront.userData.frontOrRear = 'front';
    spriteFront.userData.isHovered = false;

    const spriteMaterialRear = new THREE.SpriteMaterial({
        map: numberTexture,
        opacity: 0.3,
        transparent: true,
        depthTest: false,
        sizeAttenuation: false
    });

    let spriteRear = new THREE.Sprite(spriteMaterialRear);
    spriteRear.position.copy(annotationVector);

    computeAnnotationScale(spriteRear);

    spriteRear.name = number+1;
    spriteRear.userData.frontOrRear = 'rear';
    spriteRear.userData.isHovered = false;

    model.add(spriteFront, spriteRear);

    return spriteFront;
}

// function for annotation order
function sortEntries(entries, positionsOriginal, positionsNormalized) {
    let positionMap = new Map(positionsOriginal.map((pos, index) => [pos, positionsNormalized[index]]));

    return entries.sort((a, b) => positionMap.get(a[1].position) - positionMap.get(b[1].position));
}

function createAnnotationDOM(title, description, index, position, annotationListDiv) {
    let annotationDiv = document.createElement('div');
    let annotationTitle = document.createElement('div');
    let annotationH = document.createElement('h1');
    let annotationDescription = document.createElement('div');

    annotationDiv.setAttribute('class', 'annotation');
    annotationH.setAttribute('class', 'annotation-title');
    annotationDescription.setAttribute('class', 'annotation-description');

    // write the title and the description of the annotation
    annotationH.innerText = title;
    annotationDescription.innerHTML = description;

    annotationTitle.appendChild(annotationH);
    annotationDiv.appendChild(annotationTitle);
    annotationDiv.appendChild(annotationDescription);

    // set number of annotation to be displayed
    annotationDiv.setAttribute('data-before', `${index}`);

    // set display: none, since that label renderer is disabled
    annotationDiv.style.display = 'none';

    annotationList.push(annotationDiv);

    const annotationClone = annotationDiv.cloneNode(true);

    // for incompatible devices with dom-overlay - HoloLens
    annotationListDiv.appendChild(annotationClone);

    // also append to label2Drenderer
    document.getElementById('label-renderer').appendChild(annotationDiv);

    // set annotation label on 3D model
    const annotationLabel = new CSS2DObject(annotationDiv);
    annotationLabel.position.copy(position);
    annotationLabel.name = `${index}`;
    annotationLabel.visible = false;
    model.add(annotationLabel);

    // set 3D annotation label on 3D model - for immersive-ar mode
    const annotation3DLabel = new CSS3DObject(annotationDiv);
    annotation3DLabel.position.copy(position);
    annotation3DLabel.name = `${index}`;
    annotation3DLabel.visible = false;
    model.add(annotation3DLabel);
}

function getFormFields() {
    const title = document.getElementById('title');
    const description = document.getElementById('description');
    const coordinates = document.getElementById('coordinates');
    const position = document.getElementById('position');
    const digobjurl = document.getElementById('digobj-url');
    const digobjtitle = document.getElementById('digobj-title');
    const digobjtable = document.getElementById('digobj-table');
    const entities = document.getElementById('entities');
    const entitiesDiv = document.getElementById('selected-items');
    const oldPosition = document.getElementById('old-position');
    const eventID = document.getElementById('event-id');
    const cameraPos = document.getElementById('camera-position');
    return [title, description, coordinates, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, oldPosition, eventID, cameraPos];
}

function fillForm(title, description, coordinates, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, point, positionInList, oldPositionInList, eventID, annotationID, initializeAnnotation, cameraPos) {

    // empty digital object table
    digobjtable.textContent = '';

    // empty entities div
    entitiesDiv.textContent = '';

    // retrieve the annotation number
    let annotationNumber;
    initializeAnnotation ? annotationNumber = positionInList : annotationNumber = getNormalizedValue(json_data.events[annotationID].position);

    // retrieve cameraPosition
    let thisCamera;
    initializeAnnotation ? thisCamera = camera.position.clone() : thisCamera = json_data.events[annotationID].cameraPosition;

    // fill in the information
    eventID.value = annotationID;
    oldPositionInList.textContent = annotationNumber;
    coordinates.value = point.x + "," + point.y + "," + point.z;
    position.value = annotationNumber;
    cameraPos.textContent = thisCamera.x + "," + thisCamera.y + "," + thisCamera.z;

    if (initializeAnnotation) {

        props_temp = new Map;

        title.value = 'New annotation';
        description.value = '';

    } else {

        const digobj = json_data.events[annotationID].objurl;

        // if there are any digital objects add them to the table
        if (Array.isArray(digobj)) {
            for (let i=0; i<digobj.length; i++) {
                const digobjurlValue = digobj[i].url;
                const digobjtitleValue = digobj[i].title;
                addDigitalObject(digobjurlValue, digobjtitleValue, false, false);
            }
        }

        title.value = json_data.events[annotationID].title;
        description.value = json_data.events[annotationID].description;

        props_temp = new Map([...new Map(Object.entries(json_data["events"][annotationID]["props"]))]);

        // if there are any entities add them to the div
        let keys;
        if (props_temp) keys = [...props_temp.keys()];  // keep keys order
        if (keys && keys.length > 0) {
            for (let i = 0; i < keys.length; i++) {
                const thisEntity = props_temp.get(keys[i]);
                let entityClass;
                let entityTitle;
                thisEntity.class ? entityClass = thisEntity.class : entityClass = typeFromArray(thisEntity.type);
                thisEntity.title ? entityTitle = thisEntity.title : thisEntity.enName !== '' ? entityTitle = thisEntity.enName : thisEntity.defaultName;   // set default title to the english version
                addEntity(thisEntity, entityTitle, entityClass, keys[i], undefined);
            }
        }

    }

    setTextareaHeight(description);

}

// add annotation to list in customAnn.html
function addAnnotationToList(text, i, point, event_ID) {
    const annotationsContainer = document.getElementById('annotations-container');

    const div = document.createElement('div');
    div.setAttribute('class', 'annotation-item not-selectable');
    div.setAttribute('annotation-number', `${i}`);
    annotationsContainer.appendChild(div);

    const annotationTitle = document.createElement('div');
    annotationTitle.setAttribute('class', 'annotation-title-div');
    div.appendChild(annotationTitle);

    const annotationIndex = document.createElement('span');
    annotationIndex.setAttribute('class', 'annotation-index');
    annotationIndex.textContent = `${i}`;
    annotationTitle.appendChild(annotationIndex);

    const annotationSeparator = document.createElement('span');
    annotationSeparator.setAttribute('class', 'annotation-separator');
    annotationSeparator.textContent = ' : ';
    annotationTitle.appendChild(annotationSeparator);

    const annotationName = document.createElement('span');
    annotationName.setAttribute('class', 'annotation-name');
    annotationName.textContent = text;
    annotationTitle.appendChild(annotationName);

    const spanEventID = document.createElement('span');
    spanEventID.setAttribute('class', 'annotation-id');
    spanEventID.textContent = event_ID;
    spanEventID.style.display = 'none';
    annotationTitle.appendChild(spanEventID);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.setAttribute('class', 'annotation-buttons-div');
    div.appendChild(buttonsDiv);

    const editButton = document.createElement('button');
    editButton.setAttribute('type', 'button');
    editButton.setAttribute('class', 'btn btn-secondary edit-annotation');
    editButton.addEventListener('click', function (e) {
        // load annotation information
        try {

            // reset entities temp
            props_temp = new Map;

            // get input fields
            const [title, description, coordinates, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, oldPosition, eventID, cameraPos] = getFormFields();

            // show form
            document.getElementById('form-inner').style.display = 'block';

            // disable "save" button until user changes something
            document.getElementById('save-annotation').disabled = true;

            // update id and coordinates
            const annotationID = e.target.closest('.annotation-item').querySelector('.annotation-id').textContent;
            const currentCoordinates = json_data.events[annotationID].coordinates;
            if (!point.equals(currentCoordinates)) point = currentCoordinates;

            // fill in the form with the stored information
            fillForm(title, description, coordinates, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, point, i, oldPosition, eventID, annotationID,false, cameraPos);

            // refresh visualization and variables
            // remove annotations and reset variables
            removeAnnotations(annotationMeshList, annotationIsDisplayed);
            annotationsContainer.innerHTML = '';
            document.getElementById('annotation-list-div').innerHTML = '';
            document.querySelectorAll('canvas.number').forEach(canvas => canvas.remove());
            numberOfCanvas = 0;
            annotationList = [];
            // reload annotations
            reloadAnnotations(sketchfabAnnotations);
            // get information
            let index = document.getElementById('old-position').textContent;
            const sprites = getAllSprites(scene);
            sprites.sort((a, b) => a.name - b.name);
            // search the annotation
            let annotationFound = false;
            sprites.forEach(function (ann) {
                // show the annotation if it was displayed before the refresh
                if (ann.name === parseInt(index) && parseInt(index) === annotationDisplayed && annotationIsDisplayed) {
                    ann.visible = true;
                    let element = document.querySelector(`[data-before="${index}"]`);
                    if (element) element.style.display = 'block';
                    annotationFound = true;
                    changeCanvasColor(ann, '#f50a0a');
                }
            });
            // if annotation not found reset global variables
            if (!annotationFound) {
                annotationDisplayed = null;
                annotationIsDisplayed = false;
            }

            // reset any errors in UI
            resetErrors();

            // display alert
            showAlert('edit-annotation-alert', 'Annotation displayed successfully.', 'primary');

        } catch (e) {
            showAlert('error', 'Error:' + e, 'danger', 2000);
            console.error('Error editing annotation:', e);
        }

    });
    editButton.textContent = 'Edit';
    buttonsDiv.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.setAttribute('type', 'button');
    deleteButton.setAttribute('class', 'btn btn-delete delete-annotation');
    deleteButton.setAttribute('data-toggle', 'modal');
    deleteButton.setAttribute('data-target', '.modal');
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', function (e) {
        annotationClicked = e.target.closest('.annotation-item');
        callbackOK = function() {
            deleteAnnotation();
            removeModalListener();
        }
        showModal(
            false,
            'Confirm deletion',
            'Do you really want to delete this annotation? The change will take effect immediately.',
            'Close',
            'Delete annotation',
            callbackCancel,
            callbackOK,
            'btn-delete'
        );
    });
    buttonsDiv.appendChild(deleteButton);
}

// element in the 3D and AR scenes - it represents the circle and the number of each annotation, together with sprites
function createCanvas(number, color = 'white') {

    let canvas = document.createElement('canvas');

    canvas.setAttribute('class', 'number');
    canvas.setAttribute('width', '64');
    canvas.setAttribute('height', '64');
    canvas.setAttribute('data-number', `${number+1}`);

    document.body.appendChild(canvas);

    const x = 32;
    const y = 32;
    const radius = 30;
    const startAngle = 0;
    const endAngle = Math.PI * 2;

    let ctx = canvas.getContext("2d");

    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${number+1}`, x, y);

    return canvas;
}

function changeCanvasColor(element, color) {

    const newCanvas = createCanvas(element.name - 1, color);
    element.material.map = new THREE.CanvasTexture(newCanvas);
    element.material.needsUpdate = true;

}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(`${currentLine} ${word}`).width;
        if (width < maxWidth) {
            currentLine += ` ${word}`;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

// create annotation on HoloLens - when the user interacts with numbers
function createAnnotationPlane(htmlElement, name) {
    canvasXR = document.createElement('canvas');
    const context = canvasXR.getContext('2d');

    let lineHeight; // in px
    const padding = 10; // in px
    const maxTextWidth = 450; // in px

    const calculateHeight = (text, font) => {
        context.font = font;
        const lines = wrapText(context, text, maxTextWidth);
        return lines.length * lineHeight;
    };

    // Text sizes
    const remToPx = (rem) => rem * 16; // converting rem -> px

    const titleFont = `bold ${remToPx(3.5)}px sans-serif`;
    const textFont = '22px sans-serif';
    const subtitleFont = `bold ${remToPx(2.0)}px sans-serif`;

    const titleElement = htmlElement.querySelector('.annotation-title');
    const descriptionElement = htmlElement.querySelector('.annotation-description').querySelector('p');
    const h5Element = htmlElement.querySelector('h5');
    const entities = htmlElement.querySelectorAll('.tl-entities a');

    // Height
    let totalHeight = 0;
    lineHeight = 80; // title height
    totalHeight += calculateHeight(titleElement.textContent, titleFont);
    lineHeight = 30; // text height
    if (descriptionElement) {    // check if there is a description
        totalHeight += calculateHeight(descriptionElement.textContent, textFont);
        lineHeight = 40; // subtitle height
    }
    if (h5Element) { // check if there is the entity title
        totalHeight += calculateHeight(h5Element.textContent, subtitleFont);
        lineHeight = 30; // text height
        for (const entity of entities) {
            totalHeight += calculateHeight(entity.textContent, textFont);
        }
    }

    // Canvas size
    canvasXR.width = maxTextWidth + 2 * padding;
    canvasXR.height = totalHeight + 2 * padding;

    // Semi-transparent background
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvasXR.width, canvasXR.height);

    // Context
    context.fillStyle = 'white';
    context.textAlign = 'left';
    context.textBaseline = 'top';

    // Dynamic calculus of canvas height
    let y = padding; // initial position

    // Title
    let text = titleElement.textContent;
    context.font = titleFont;
    lineHeight = 80; // title height
    let lines = wrapText(context, text, maxTextWidth);
    for (const line of lines) {
        context.fillText(line, padding, y);
        y += lineHeight;
    }

    // Description
    if (descriptionElement) {
        text = descriptionElement.textContent;
        context.font = textFont;
        lineHeight = 30; // text height
        lines = wrapText(context, text, maxTextWidth);
        for (const line of lines) {
            context.fillText(line, padding, y);
            y += lineHeight;
        }
    }

    // Subtitle
    if (h5Element) {
        text = h5Element.textContent;
        context.font = subtitleFont;
        lineHeight = 40; // subtitle height
        lines = wrapText(context, text, maxTextWidth);
        for (const line of lines) {
            context.fillText(line, padding, y);
            y += lineHeight;
        }


        // Entities
        context.font = textFont;
        lineHeight = 30;
        for (const entity of entities) {
            const entityText = entity.textContent;
            const textWidth = context.measureText(entityText).width;

            // Draw the link
            context.fillStyle = 'blue';
            context.fillText(entityText, padding, y);

            // Save clickable area
            clickableAreas.push({
                x: padding,
                y: y,
                width: textWidth,
                height: lineHeight,
                url: entity.href, // memorize URL
            });

            y += lineHeight;
        }
    }

    // Texture and materials
    const texture = new THREE.CanvasTexture(canvasXR);

    const materialFront = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.FrontSide,
    });

    const materialBack = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.BackSide,
    });

    model.updateWorldMatrix(true);
    const bbox = new THREE.Box3().setFromObject(model);
    const modelSize = new THREE.Vector3();
    bbox.getSize(modelSize);

    const modelWidth = modelSize.x;

    const canvasToWorldScale = modelWidth * 0.02;
    const planeHeight = canvasXR.height * canvasToWorldScale;
    const planeWidth = canvasXR.width * canvasToWorldScale;

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

    const planeFront = new THREE.Mesh(geometry, materialFront);
    const planeBack = new THREE.Mesh(geometry, materialBack);

    planeBack.scale.x = -1; // flip x-axis to avoid mirrored text

    const offset = 0.001;
    planeFront.position.z = offset / 2;
    planeBack.position.z = -offset / 2;

    planeFront.name = "planeFront";
    planeBack.name = "planeBack";

    // add planes to global variables
    planesArray.push(planeFront, planeBack);

    const group = new THREE.Group();
    group.add(planeFront);
    group.add(planeBack);

    // dynamic gap calculation
    const arScaleFactor = 0.6;
    const newScale = scale * arScaleFactor;
    const shiftX = -(planeWidth / 2) / (newScale * 4);

    //group.position.set(modelSceneCenter.x + totalOffsetX, model.position.y, model.position.z);
    group.position.set(modelSceneCenter.x + shiftX, model.position.y, model.position.z);

    //group.position.set(model.position.x + 1.5 / scale, model.position.y, model.position.z);
    group.name = name;
    modelScene.add(group);

    annotationMeshList.push(group);

    return group;
}

function deleteAnnotation() {
    try {

        // update json_data decreasing the positions of subsequent events
        let decreaseFromNowOn = false;
        let thisAnnotationToRemove = null;

        for (let property in json_data.events) {

            if (decreaseFromNowOn) json_data.events[property].position -= 1;
            else {

                const title = json_data.events[property].title;
                const position = getNormalizedValue(json_data.events[property].position);
                const thisTitle = annotationClicked.querySelector('.annotation-name').textContent;
                const thisPosition = parseInt(annotationClicked.querySelector('.annotation-index').textContent);

                // remove annotation from json and start decreasing positions
                if (title === thisTitle && position === thisPosition) {
                    decreaseFromNowOn = true;
                    delete json_data.events[property];

                    thisAnnotationToRemove = model.children.filter(child => child.isCSS2DObject && parseInt(child.name) === thisPosition);
                }

            }

        }

        // reset global annotation variable if displayed
        if (thisAnnotationToRemove) thisAnnotationToRemove.forEach(function (ann) {
            if (annotationIsDisplayed && parseInt(ann.name) === annotationDisplayed) {
                hideAnnotations();
                ann.parent.remove(ann);
                annotationDisplayed = null;
                annotationIsDisplayed = false;
            }
        });

        // save file
        saveJson(modelName, json_data);

        positionsOriginal = extractPositions(json_data.events);
        positionsNormalized = normalizePositions(positionsOriginal);

        // delete sprites and annotations from list
        const annotationsContainer = document.getElementById('annotations-container');
        removeAnnotations(annotationMeshList, annotationIsDisplayed);
        annotationsContainer.innerHTML = '';
        document.getElementById('annotation-list-div').innerHTML = '';
        document.querySelectorAll('canvas.number').forEach(canvas => canvas.remove());
        numberOfCanvas = 0;
        annotationList = [];

        // hide form
        document.getElementById('form-inner').style.display = 'none';

        // re-insert annotations in list and sprites
        reloadAnnotations(sketchfabAnnotations);

        //refresh scene in scene.html
        refreshViewer();

        // display alert
        showAlert('annotation-deleted', 'Annotation deleted.', 'primary', 1500);
    } catch (e) {
        showAlert('error', 'Error:' + e, 'error', 2000);
        console.error('Error deleting annotation: ' + e);
    }
}

function getAllSprites(object, onlyFront=false) {
    let sprites = [];

    if (onlyFront) {

        if (object.type === 'Sprite' && object.userData.frontOrRear === 'front') {
            sprites.push(object);
        }

    } else {

        if (object.type === 'Sprite') {
            sprites.push(object);
        }

    }

    object.children.forEach(child => {
        sprites = sprites.concat(getAllSprites(child, onlyFront));
    });

    return sprites;
}

function getRandomEventID() {
    return getRandom13DigitNumber().toString();
}

function addDigitalObject(inputValue, inputValue2, auto, validation) {
    try {

        if (validation && !checkDigObj()) {
            showAlert('digobj-validation', 'Digital object not added. Please check the information carefully.', 'warning', 1500);
            return;
        }

        const url = new URL(inputValue);
        const digobjurl = document.getElementById('digobj-url');
        const digobjtitle = document.getElementById('digobj-title');

        digobjurl.value = '';
        let inputUrlGroup = digobjurl.closest('.input-group');
        if (inputUrlGroup) {
            inputUrlGroup.classList.remove('has-error');
        }

        digobjtitle.value = '';
        let inputTitleGroup = digobjurl.closest('.input-group');
        if (inputTitleGroup) {
            inputTitleGroup.classList.remove('has-error');
        }

        createDigObjPreview(url, inputValue2);
    } catch (TypeError) {
        if (inputValue.indexOf('http://') < 0) {
            addDigitalObject('http://' + inputValue, inputValue2, auto, false);
        } else if (!auto) {
            const inputUrlGroup = document.getElementById('digobj-url').closest('.input-group');
            inputUrlGroup.classList.add('has-error');

            const inputTitleGroup = document.getElementById('digobj-title').closest('.input-group');
            inputTitleGroup.classList.add('has-error');
        }
    }
}

// the element and its style in DOM
function createDigObjPreview(urlObj, title) {
    let regex = /<title>(.*?)</;

    if (!document.querySelector("#digobj-table .digobj-preview[data-url='" + urlObj + "']")) {

        let previewLink = document.createElement("a");
        previewLink.target = "_blank";
        previewLink.href = urlObj;

        let previewDiv = document.createElement("div");
        previewDiv.className = "digobj-preview";
        previewDiv.setAttribute("data-url", urlObj);

        let deleteButton = document.createElement("div");
        deleteButton.className = "deleteButton digobj-deleteButton";
        deleteButton.setAttribute("data-toggle", "modal");
        deleteButton.setAttribute('data-target', '.modal');
        deleteButton.addEventListener('click', function (e) {
            e.preventDefault();
            callbackOK = function () {
                dourl = previewDiv.getAttribute("data-url");
                confirmDeleteDigObj(dourl);
                removeModalListener();
            }
            showModal(
                false,
                'Delete Digital Object',
                'Are you sure you want to delete this digital object?',
                'Keep object',
                'Delete object',
                callbackCancel,
                callbackOK,
                'btn-delete'
            );
        });

        let deleteSymbol = document.createElement("b");
        deleteSymbol.className = "x";
        deleteSymbol.textContent = "\u00D7";
        deleteButton.appendChild(deleteSymbol);

        let spanTruncated = document.createElement("span");
        spanTruncated.className = "truncated-value";
        spanTruncated.setAttribute("onmouseover", "displayDigObjTooltip(this);");
        spanTruncated.setAttribute("data-original-title", title);
        spanTruncated.style.display = "table-cell";
        spanTruncated.style.verticalAlign = "middle";
        spanTruncated.style.width = "100%";
        spanTruncated.textContent = title;

        let spanHidden = document.createElement("span");
        spanHidden.className = "hidden-true-value";
        spanHidden.textContent = title;

        previewDiv.appendChild(deleteButton);
        previewDiv.appendChild(spanTruncated);
        previewDiv.appendChild(spanHidden);
        previewLink.appendChild(previewDiv);

        document.getElementById("digobj-table").appendChild(previewLink);

        if (title === "") {
            fetch("./PHP/getDigitalObjectPageForCorsP.php", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: "urlob=" + encodeURIComponent(urlObj)
            })
                .then(response => response.json())
                .then(data => {
                    let match = data.html.match(regex);
                    if (match !== null) {
                        let foundTitle = match[0].split(">")[1].split("<")[0];
                        let previewElement = document.querySelector("#digobj-table .digobj-preview[data-url='" + urlObj + "'] span");
                        if (previewElement) {
                            previewElement.textContent = foundTitle;
                        }
                    }
                })
                .catch(() => {
                    console.log('AJAX request for Digital Object not loaded.');
                });
        }
    }

    selectDigObjs();
}

function confirmDeleteDigObj(url) {
    let previewElement = document.querySelector("#digobj-table .digobj-preview[data-url='" + url + "']");
    let parentAnchor = previewElement.closest("a");
    parentAnchor.remove();
}

// select this digital object and set the text style
function selectDigObjs() {
    let container = document.querySelectorAll("#digobj-table .digobj-preview");
    container.forEach(element => {
        adjustText(element);
    });
}

function adjustText(container) {
    let textElement = container.querySelector('.truncated-value');
    let hiddenElement = container.querySelector(".hidden-true-value");
    let originalText = hiddenElement ? hiddenElement.textContent : "";

    let containerWidth = container.clientWidth;
    let characterWidth = 13;

    let maxLength = Math.floor(containerWidth / characterWidth);

    if (textElement) textElement.innerHTML = truncate(originalText, maxLength);

}

// truncate text if it is too long
function truncate(string, len) {
    return string.length > len ? string.substring(0, len).trim() + "..." : string;
}

function displayDigObjTooltip(thisElement) {

    // the text is truncated when it shows '...'
    if (thisElement.textContent.includes("...")) {
        tooltip = new bootstrap.Tooltip(thisElement);
        tooltip.show();
    }

    thisElement.addEventListener("mouseleave", function removeTooltip() {
        // if title is truncated, i.e. tooltip is displayed
        if (thisElement.textContent !== thisElement.getAttribute('data-original-title')) {
            tooltip.dispose();
            thisElement.removeEventListener("mouseleave", removeTooltip);
        }
    });

}

// it is needed when the cursor is over the entity on the customAnn page
function darkenColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = ((num >> 8) & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return (
        "#" +
        (
            0x1000000 +
            (Math.max(0, R) << 16) +
            (Math.max(0, G) << 8) +
            Math.max(0, B)
        )
            .toString(16)
            .slice(1)
    );
}

function addEntity(props, text, type, id, entityLoaderDiv) {

    const color = getColor(type);

    const selectedItemsContainer = document.getElementById("selected-items");
    let selectedItem = document.createElement("div");

    selectedItem.id = id;
    selectedItem.classList.add("wikidata-entities");
    selectedItem.setAttribute('data-type', type);
    selectedItem.style.display = "inline-flex";
    selectedItem.style.alignItems = "center";
    selectedItem.style.padding = "5px 10px";
    selectedItem.style.margin = "5px";
    selectedItem.style.border = "1px solid #bbb";
    selectedItem.style.borderRadius = "4px";
    selectedItem.style.backgroundColor = color;
    selectedItem.style.boxShadow = "2px 2px 3px lightgrey";
    selectedItem.style.color = "black";
    selectedItem.style.cursor = "pointer";
    selectedItem.style.maxWidth = "200px";
    selectedItem.style.overflow = "hidden";
    selectedItem.style.whiteSpace = "nowrap";
    selectedItem.style.textOverflow = "ellipsis";
    selectedItem.style.position = "relative";

    // to simulate :hover effect
    selectedItem.addEventListener('mouseenter', () => {
        selectedItem.style.backgroundColor = darkenColor(color, 5);
    });
    selectedItem.addEventListener('mouseleave', () => {
        selectedItem.style.backgroundColor = color;
    });

    let link = document.createElement("a");
    link.href = "https://www.wikidata.org/wiki/" + id;
    link.target = "_blank";
    link.style.flexGrow = "1";
    link.style.textDecoration = "none";
    link.style.color = "black";
    link.style.overflow = "hidden";
    link.style.whiteSpace = "nowrap";
    link.style.textOverflow = "ellipsis";
    link.innerText = truncate(text, 20);

    let textSpan = document.createElement("span");
    textSpan.classList.add('entity-original-name');
    textSpan.innerText = text;
    textSpan.style.display = "none";
    link.appendChild(textSpan);

    let removeButton = document.createElement("span");
    removeButton.innerText = "\u00D7";
    removeButton.style.marginLeft = "8px";
    removeButton.style.color = "red";
    removeButton.style.cursor = "pointer";
    removeButton.style.flexShrink = "0";
    removeButton.addEventListener("click", function (event) {
        event.stopPropagation();
        selectedItem.parentNode.removeChild(selectedItem);

        document.getElementById('save-annotation').disabled = false;

        // update temp props variable
        props_temp.delete(id);

    });

    selectedItem.appendChild(link);
    selectedItem.appendChild(removeButton);

    // remove loading icon - only if the function is called by sparqlRequest()
    entityLoaderDiv !== undefined
        ? entityLoaderDiv.remove()
        : null;

    selectedItemsContainer.appendChild(selectedItem);
}

function showModal(forceShow, title, text, btnCancel, btnOK, callbackCancel, callbackOK, classButton='btn-primary') {

    // fill HTML modal information
    const modal = document.getElementById('modal-container');
    const modalTitle = modal.querySelector('#modal-title');
    const modalMessage = modal.querySelector('.modal-body');
    const modalCancel = modal.querySelector('#modal-dismiss');
    const modalConfirm = modal.querySelector('#modal-confirm');
    modalTitle.textContent = title;
    modalMessage.innerHTML = text;

    // Destroy any previous instance if needed - for robustness
    if (modal._bootstrapModalInstance) {
        modal._bootstrapModalInstance.hide();
        modal._bootstrapModalInstance.dispose();
    }

    const options = forceShow
        ? {backdrop: 'static', keyboard: false}
        : {backdrop: true, keyboard: true};

    const modalBootstrap = new bootstrap.Modal(modal, options);

    if (forceShow) {
        modalBootstrap.show();
        modal.querySelector('.close').style.display = 'none';
        modal.setAttribute('data-bs-backdrop', 'static');   // it cannot be closed by clicking outside
        modal.setAttribute('data-bs-keyboard', 'false');   // it cannot be closed by pressing ESC from keyboard
    } else {
        modal.querySelector('.close').style.display = 'inline-block';
        modal.setAttribute('data-bs-backdrop', 'true');   // default behavior
        modal.setAttribute('data-bs-keyboard', 'true');   // default behavior
    }

    // if button are present add listeners
    if (btnCancel) {

        modalCancel.textContent = btnCancel;

        modalCancel.addEventListener('click', callbackCancel);

        modalCancel.style.display = "inline-block";

    } else modalCancel.style.display = "none";

    if (btnOK) {

        modalConfirm.textContent = btnOK;

        modalConfirm.addEventListener('click', callbackOK);

        modalConfirm.style.display = "inline-block";

        // change class of confirm button
        modalConfirm.classList.remove(...modalConfirm.classList); // remove all classes
        modalConfirm.classList.add('btn');
        modalConfirm.classList.add(classButton);

    } else modalConfirm.style.display = "none";

}

function removeModalListener() {
    const modal = document.getElementById('modal-container');
    const modalCancel = modal.querySelector('#modal-dismiss');
    const modalConfirm = modal.querySelector('#modal-confirm');

    modalCancel.removeEventListener('click', callbackCancel);
    modalConfirm.removeEventListener('click', callbackOK);
}

function resetErrors() {
    const inputs = document.querySelectorAll('#new-annotation-form input');
    inputs.forEach(input => {
        input.style.border = '1px solid #ced4da';
    });
}

// translate ID into word
function typeFromArray(array) {

    if (array.indexOf("other") > -1) {
        return "other";
    }
    if (array.indexOf("Q15474042") > -1) {
        return "hidden";
    }
    if (array.indexOf("Q4167836") > -1) {
        return "hidden";
    }
    if (array.indexOf("Q27096213") > -1) {
        return "place";
    }
    if (array.indexOf("Q5") > -1 || array.indexOf("Q8436") > -1) {
        return "person";
    }
    if (array.indexOf("Q234460") > -1) {
        return "work";
    }
    if (array.indexOf("Q41176") > -1) {
        return "object";
    }
    if (array.indexOf("Q17334923") > -1) {
        return "place";
    }
    if (array.indexOf("Q8205328") > -1) {
        return "object";
    }
    if (array.indexOf("Q43229") > -1) {
        return "organization";
    }
    if (array.indexOf("Q386724") > -1) {
        return "work";
    }
    if (array.indexOf("Q1190554") > -1) {
        return "other";
    }
    if (array.indexOf("Q186081") > -1) {
        return "hidden";
    }
    if (array.indexOf("Q7184903") > -1 || array.indexOf("Q4026292") > -1 || array.indexOf("Q5127848")) {
        return "concept";
    }
    if (array.indexOf("Q488383") > -1) {
        return "object";
    }
    if (array.indexOf("Q15222213") > -1) {
        return "object";
    }
    return "other";
}

function getColor(type) {
    if (type !== undefined) type = type.toLowerCase();
    if (type === "event") return "#c8ffc8";
    if (type === "person") return "#dba2e7";
    if (type === "organization") return "#eda5bd";
    if (type === "object") return "#f5afa9";
    if (type === "concept") return "#ffe2df";
    if (type === "place") return "#f5c695";
    if (type === "work") return "#f2eb96";
    if (type === "other") return "#ffffff";
}

// data validation
function checkData() {

    let wrongData = true;

    const positionInput = document.getElementById('position');
    const decimalInput = document.getElementById('coordinates');
    const titleInput = document.getElementById('title');
    const positionValue = positionInput.value.trim();
    const decimalValue = decimalInput.value.trim();
    const titleValue = titleInput.value.trim();

    // reset previous errors
    positionInput.style.border = "";
    decimalInput.style.border = "";
    titleInput.style.border = "";

    // the form is not accepted if...
    // ...the position value is not empty or a positive integer or is higher than the max value of positions
    if (positionValue === '' || !/^\d+$/.test(positionValue) || positionValue > Math.max(...positionsNormalized)) {
        positionInput.style.border = "2px solid red";
        wrongData = false;
    }

    // ...the coordinates are not empty or expressed in the form (x.x, y.y, z.z)
    if (decimalValue === '' || !/^-?\d*\.\d+,-?\d*\.\d+,-?\d*\.\d+$/.test(decimalValue)) {
        decimalInput.style.border = "2px solid red";
        wrongData = false;
    }

    if (titleValue === '') {
        titleInput.style.border = "2px solid red";
        wrongData = false;
    }

    return wrongData;

}

// data validation for digital objects
function checkDigObj() {

    let wrongData = true;

    const digobjtitleInput = document.getElementById('digobj-title');
    const digobjurlInput = document.getElementById('digobj-url');
    const digobjtitleValue = digobjtitleInput.value.trim();
    const digobjurlValue = digobjurlInput.value.trim();

    digobjurlInput.style.border = "";
    digobjtitleInput.style.border = "";

    // the object is not accepted if the URL of digital object is empty or contains a non-URL string if and only if there is a string in the title of the digital object
    const urlPattern = /^(https?:\/\/)?([\w\d-]+\.)+[\w]{2,}(\/.*)?$/;
    if (digobjtitleValue === "") {
        digobjtitleInput.style.border = "2px solid red";
        wrongData = false;
    }

    if (digobjurlValue === "" || !urlPattern.test(digobjurlValue)) {
        digobjurlInput.style.border = "2px solid red";
        wrongData = false;
    }

    return wrongData;
}

// UI changes that are applied when the "change coordinates" button is clicked
function changeCoors() {
    changeCoordinates = true;

    // invert the state
    isCrosshair = !isCrosshair;

    const sceneContainer = document.getElementById('scene-container');

    isCrosshair
        ? sceneContainer.style.cursor = 'crosshair'
        : sceneContainer.style.cursor = 'default';

    // enable/disable the 'Add annotation (+)' button
    switchButtonVisibility(document.getElementById("add-annotation-button"));

    const alertDiv = document.getElementById('change-coordinates-alert');
    if (!alertDiv) showAlert('change-coordinates-alert', 'Click a point on the model. Press the button again to exit.', 'info', -1);   // show info alert
    else if (alertDiv.parentNode) alertDiv.parentNode.removeChild(alertDiv);
}

function switchButtonVisibility(button, forceEnable = false) {
    if (forceEnable) {
        button.disabled = false;
        button.style.opacity = "1";
    } else {
        button.disabled = !button.disabled;
        button.style.opacity = button.disabled ? "0.5" : "1";
    }
}

// resize textarea height (mainly for description field in form)
function setTextareaHeight(textarea) {
    if (textarea.value !== '') {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
    } else {
        textarea.style.height = 'auto';
    }
}

// truncate version for all annotations in annotationsPanel
function truncateTextToFitAll() {
    const elements = document.querySelectorAll('.annotationButton');

    elements.forEach(el => {
        const original = el.getAttribute('original-title') || el.textContent;
        el.setAttribute('original-title', original);
        el.textContent = original;

        if (el.scrollWidth > el.clientWidth) {
            let truncated = original;
            while (truncated.length > 1 && el.scrollWidth > el.clientWidth) {

                truncated = truncated.slice(0, -1);
                el.textContent = truncated + '...';

            }
        }
    });
}

function closeTooltips(tooltip) {
    if (tooltip) {
        tooltip.hide();
        tooltip = null;
    }
}

// functions globally available
window.saveJSONAnnotations = saveJSONAnnotations;
window.deleteAnnotation = deleteAnnotation;
window.addDigitalObject = addDigitalObject;
window.displayDigObjTooltip = displayDigObjTooltip;
window.confirmDeleteDigObj = confirmDeleteDigObj;
window.changeCoors = changeCoors;
window.refreshViewer = refreshViewer;
window.refreshTheme = refreshTheme;
window.applyTheme = applyTheme;
window.closeTooltips = closeTooltips;

// resize digital objects in customAnn.html or add scroll to annotationsPanel and resize text in scene.html
window.addEventListener('resize', function () {

    if (isCustomAnn) selectDigObjs();
    else {

        const ulAnn = document.getElementById('annotation-list');

        // add scroll
        if (ulAnn) {
            const annotationsPanel = document.getElementById('annotationsPanel');
            if (ulAnn.scrollHeight > annotationsPanel.clientHeight) annotationsPanel.style.overflowY = 'scroll';
            else annotationsPanel.style.overflowY = 'initial';

            // resize text
            truncateTextToFitAll();
        }

    }

}, true);

// (reload the scene || change theme) in scene.html if ("save changes" button || theme toggle) is clicked from customAnn.html
if (window.location.pathname.includes('scene.html')) {

    window.addEventListener('storage', async function (e) {

        if (e.key === 'updateFromCustomAnn' + modelName ) {

            // it keeps alive the refreshing process
            console.log("Refreshing scene...");

            // reload json_data
            await fetch('./json/' + username + '/' + modelName.slice(0, -4) + '.json?nocache=' + new Date().getTime())
                .then(response => response.json())
                .then(function (data) {

                    // store all json information in a global variable
                    json_data = data;

                    event_entities = data["entities"]; // keep props in order
                }).catch(error => {
                    console.error("Error refreshing scene: ", error);
                });

            positionsOriginal = extractPositions(json_data.events);
            positionsNormalized = normalizePositions(positionsOriginal);

            // delete sprites and annotations from the list
            removeAnnotations(annotationMeshList, annotationIsDisplayed);
            document.querySelectorAll('canvas.number').forEach(canvas => canvas.remove());
            numberOfCanvas = 0;
            annotationList = [];

            reloadAnnotations(sketchfabAnnotations, true);

            // if an annotation was displayed, find it and show it
            const sprites = getAllSprites(scene);
            sprites.sort((a, b) => a.name - b.name);
            // search the annotation
            let annotationFound = false;
            sprites.forEach(function (ann) {
                // show the annotation if it was displayed before the refresh
                if (ann.name === annotationDisplayed && annotationIsDisplayed) {
                    ann.visible = true;
                    let element = document.querySelector(`[data-before="${ann.name}"]`);
                    if (element) element.style.display = 'block';
                    annotationFound = true;
                    changeCanvasColor(ann, '#f50a0a');
                }
            });
            // if an annotation was not displayed, reset global variables
            if (!annotationFound) {
                annotationDisplayed = null;
                annotationIsDisplayed = false;
            }

        }

        if (e.key === 'dark-' + modelName || e.key === 'light-' + modelName) {
            const theme = e.key.split("-")[0];
            applyTheme(theme);
        }

    });

}

// change theme in customAnn.html if the theme toggle is clicked from scene.html
if (window.location.pathname.includes('customAnn.html')) {

    window.addEventListener('storage', async function (e) {

        if (e.key === 'dark-' + modelName || e.key === 'light-' + modelName) {
            const theme = e.key.split("-")[0];
            applyTheme(theme);
        }

    });

}

function onElementReady(selector, callback) {
    const element = document.querySelector(selector);
    if (element) {
        callback(element);
        return;
    }

    const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
            callback(el);
            observer.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

if (document.readyState === "complete") {

    if (isCustomAnn) {
        // initialize tooltips - for customAnn.html
        let tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'));
        tooltipTriggerList.forEach(function (tooltipTriggerEl) {
            new bootstrap.Tooltip(tooltipTriggerEl);
        });

        // add event listeners to tooltips
        const tooltips = document.querySelectorAll(".tooltips");
        let activeTooltip = null;

        tooltips.forEach(tooltip => {
            let bsTooltip = new bootstrap.Tooltip(tooltip, {trigger: "manual"});

            // close the tooltip if the user clicks on another tooltip or close if it is the same and it is already opened
            tooltip.addEventListener("click", function (event) {
                event.preventDefault();
                // if tooltip is open then close it, otherwise open it
                if (tooltip.getAttribute("aria-describedby")) {
                    bsTooltip.hide();
                    activeTooltip = null;
                } else {
                    if (activeTooltip) activeTooltip.hide();
                    bsTooltip.show();
                    activeTooltip = bsTooltip;
                }
            });
        });

        // close the tooltip if the click is outside of it
        document.addEventListener("click", function (event) {
            if (!event.target.closest(".tooltips, .tooltip")) {
                if (activeTooltip) {
                    activeTooltip.hide();
                    activeTooltip = null;
                }
            }
        });

        // close tooltips if the user scrolls
        document.getElementById('panel-container').addEventListener("scroll", function () {closeTooltips(activeTooltip);});
        document.getElementById('form-container').addEventListener("scroll", function () {closeTooltips(activeTooltip);});

        // enable the "Save" button of an annotation form if the user changes something
        const saveButton = document.getElementById('save-annotation');
        const form = document.getElementById('new-annotation-form');
        form.addEventListener("input", function () {
            saveButton.disabled = false;
        });

        // wikidata item suggestions - for customAnn.html
        let inputElement = document.getElementById("entities");
        let visibleCount = 5;
        let fullSuggestions = [];

        // show suggestions when the user searches for an entity
        let typeahead = new Bloodhound({
            datumTokenizer: Bloodhound.tokenizers.whitespace,
            queryTokenizer: Bloodhound.tokenizers.whitespace,
            remote: {
                url: "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&origin=*&limit=20&search=%QUERY",
                wildcard: "%QUERY",
                transform: function (response) {
                    return response.search.map(function (item) {
                        return {
                            id: item.id,
                            value: item.label,
                            description: item.description || "No description available."
                        };
                    });
                }
            }
        });

        typeahead.initialize();

        inputElement.addEventListener("input", function () {
            let query = inputElement.value;
            let dropdown = document.getElementById("suggestions-dropdown");

            if (!query || query.length < 2) {
                if (dropdown) {
                    dropdown.innerHTML = "";
                    dropdown.style.display = "none";
                }
                return;
            } else if (dropdown) dropdown.style.display = "block";

            fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&origin=*&limit=20&search=${encodeURIComponent(query)}`)
                .then(response => response.json())
                .then(data => {
                    fullSuggestions = data.search.map(item => ({
                        id: item.id,
                        value: item.label,
                        description: item.description || "No description available.",
                        url: item.url
                    }));
                    visibleCount = 5;   // reset count
                    displaySuggestions();
                })
                .catch(error => console.error("Error fetching data:", error));
        });

        function displaySuggestions() {
            let dropdown = document.getElementById("suggestions-dropdown");
            if (!dropdown) {
                dropdown = document.createElement("div");
                dropdown.id = "suggestions-dropdown";
                dropdown.style.position = "sticky";
                dropdown.style.background = "white";
                dropdown.style.border = "1px solid #ccc";
                dropdown.style.width = "100%";
                dropdown.style.maxHeight = "200px";
                dropdown.style.overflowY = "auto";
                dropdown.style.zIndex = "1000";
                inputElement.parentNode.insertBefore(dropdown, document.getElementById('selected-items'));
            }

            dropdown.innerHTML = "";

            const visibleSuggestions = fullSuggestions.slice(0, visibleCount);

            visibleSuggestions.forEach(item => {
                const div = document.createElement("div");
                div.innerHTML = `<strong>${item.value}</strong> (${item.id})<br><small>${item.description}</small>`;
                div.style.padding = "8px";
                div.style.cursor = "pointer";
                div.style.borderBottom = "1px solid #ddd";
                div.addEventListener("mouseenter", () => div.style.background = "#f0f0f0");
                div.addEventListener("mouseleave", () => div.style.background = "white");
                div.addEventListener("click", async () => {
                    await addSelectedItem(item);
                    dropdown.innerHTML = "";
                    inputElement.value = "";
                    dropdown.style.display = "none";
                });
                dropdown.appendChild(div);
            });

            // show more...
            if (visibleCount < fullSuggestions.length) {
                const showMore = document.createElement("div");
                showMore.textContent = "Show more...";
                showMore.style.padding = "8px";
                showMore.style.cursor = "pointer";
                showMore.style.fontWeight = "bold";
                showMore.style.textAlign = "center";
                showMore.style.background = "#f9f9f9";
                showMore.addEventListener("mouseenter", () => showMore.style.background = "#e0e0e0");
                showMore.addEventListener("mouseleave", () => showMore.style.background = "#f9f9f9");
                showMore.addEventListener("click", (event) => {
                    event.stopPropagation();    // to avoid triggering the listener to close the dropdown
                    visibleCount += 5;
                    displaySuggestions();
                });
                dropdown.appendChild(showMore);
            }
        }

        // implement complete entity information
        async function addSelectedItem(item) {

            // add loading icon
            const entityLoaderDiv = document.createElement('div');
            entityLoaderDiv.setAttribute('id', 'entity-loader-div');
            const entityLoader = document.createElement('div');
            entityLoader.setAttribute('id', 'entity-loader');
            const selectedItemsContainer = document.getElementById("selected-items");
            selectedItemsContainer.appendChild(entityLoaderDiv);
            entityLoaderDiv.appendChild(entityLoader);

            sparqlRequest(item, true, undefined).then(async function (result) {

                // add to global variable event_entities
                event_entities[result._id] = result;

                addEntity(result, item.value, typeFromArray(result.type), result._id, entityLoaderDiv);

                // get type and role
                const type = typeFromArray(result.type);
                let newEntityMap;
                let fetchPromises = [];

                let title;
                result.enName !== '' ? title = result.enName : title = result.defaultName;

                if (type === 'person') {

                    let role = "";

                    for (let i = 0; i < result.role.length; i++) {

                        fetchPromises.push(
                            fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&origin=*&search=${encodeURIComponent(result.role[i])}`)
                                .then(response => response.json())
                                .then(data => {
                                    if (role) role += ", ";
                                    role += data.search[0].label;
                                })
                                .catch(error => console.error("Error fetching data:", error))
                        );
                    }

                    await Promise.all(fetchPromises);

                    newEntityMap = new Map([
                        [result._id, {
                            role: role,
                            class: type,
                            title: title,
                        }]
                    ]);

                } else {
                    newEntityMap = new Map([
                        [result._id, {
                            class: type,
                            title: title,
                        }]
                    ]);
                }

                // if the event is already present, merge the props
                if (props_temp !== undefined) {
                    const mergedProps = new Map(props_temp);
                    newEntityMap.forEach((value, key) => {
                        mergedProps.set(key, value);
                    });
                    props_temp = mergedProps;
                } else {
                    // otherwise insert the new entity
                    props_temp = newEntityMap;
                }

            }).catch(error => {
                console.error("Error sparqlRequest: ", error);
            });
        }

        function sparqlRequest(item, force, entity) {
            return new Promise((resolve, reject) => {
                const query = makeQuery([item.id], true);

                const sparqlURL = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);

                $.getJSON(sparqlURL)
                    .done(function (data) {

                        // if sparql query gets a result...
                        if (data["results"]["bindings"] !== "") {

                            data = data["results"]["bindings"];

                            let newItemsToLoad;

                            for (let i = 0; i < data.length; i++) {
                                newItemsToLoad = sparqlToItem(data[i], force);

                                if (entity) {
                                    entity.type.push(newItemsToLoad.type[0]);
                                } else {
                                    entity = newItemsToLoad;
                                }

                                if (newItemsToLoad.length > 0) {
                                    sparqlRequest(newItemsToLoad, undefined, entity).then(resolve);
                                    return;
                                }
                            }
                        }

                        resolve(entity);

                    }).fail(function (e) {

                    showModal(
                        false,
                        "Entity not found",
                        "There is an error with this wikidata entity. Please search another entity and report this error to <a href='mailto:claudio.demartino@isti.cnr.it?subject=AR%20Entity_Error_" + item.id + "'>claudio.demartino@isti.cnr.it</a>",
                        undefined,
                        "OK",
                        function () {
                        },
                        function () {
                        }
                    );

                    console.error("Error:", e);
                    reject(e);

                });

            });
        }

        // same functions of SMBVT
        function sparqlToItem(item, force) {
            let qid = item["uri"]["value"].split("entity/")[1];
            let newItem = {};

            newItem._id = qid;
            newItem._rev = undefined;
            newItem.itName = "";
            newItem.enName = "";
            newItem.defaultName = "";
            newItem.itDesc = "";
            newItem.enDesc = "";
            newItem.image = "";
            newItem.type = [];
            newItem.role = [];

            // Extract basic data from each entity
            if ("itName" in item) newItem["itName"] = item["itName"]["value"];
            if ("enName" in item) newItem["enName"] = item["enName"]["value"];
            if ("defaultName" in item) newItem["defaultName"] = item["defaultName"]["value"];
            if ("itDesc" in item) newItem["itDesc"] = item["itDesc"]["value"];
            if ("enDesc" in item) newItem["enDesc"] = item["enDesc"]["value"];
            if ("image" in item) newItem["image"] = item["image"]["value"];
            if ("coordinatesPoint" in item) newItem["coordinatesPoint"] = item["coordinatesPoint"]["value"];
            if ("birth" in item) newItem["birth"] = item["birth"]["value"].replace("+", "").split("T")[0].split("-01-01")[0];
            if ("death" in item) newItem["death"] = item["death"]["value"].replace("+", "").split("T")[0].split("-01-01")[0];
            if ("birthPlace" in item) newItem["birthPlace"] = item["birthPlace"]["value"].split("entity/")[1];
            if ("deathPlace" in item) newItem["deathPlace"] = item["deathPlace"]["value"].split("entity/")[1];
            if ("foundation" in item) newItem["foundation"] = item["foundation"]["value"].replace("+", "").split("T")[0].split("-01-01")[0];
            if ("foundation2" in item) newItem["foundation2"] = item["foundation2"]["value"].replace("+", "").split("T")[0].split("-01-01")[0];
            if ("completion" in item) newItem["completion"] = item["completion"]["value"].replace("+", "").split("T")[0].split("-01-01")[0];

            let newRole;

            // Extract roles of the entity
            if ("occupation" in item) {
                newRole = item["occupation"]["value"].split("entity/")[1];
                if (newItem["role"].indexOf(newRole) < 0) {
                    newItem["role"].push(addRole(newRole));
                }
            }
            if ("position" in item) {
                newRole = item["position"]["value"].split("entity/")[1];
                if (newItem["role"].indexOf(newRole) < 0) {
                    newItem["role"].push(addRole(newRole));
                }
            }

            // Extract type of the entity
            if ("type" in item) {
                newItem["type"].push(item["type"]["value"].split("entity/")[1]);
            } else if (force) {
                newItem["type"].push("other");
            }

            return newItem;
        }

        function addRole(role) {
            if (role !== undefined && role.indexOf("entity/") > -1) {
                role = role.split("entity/")[1];
            }
            return role;
        }

        function makeQuery(qids, force) {
            let types = "VALUES ?type {\n wd:Q15222213 wd:Q17334923 wd:Q43229 wd:Q8436 wd:Q488383 " +
                "wd:Q7184903 wd:Q386724 wd:Q234460 wd:Q5 wd:Q186081 wd:Q1190554 wd:Q35120 " +
                "wd:Q15474042 wd:Q4167836 wd:Q41176 wd:Q8205328 wd:Q5127848 wd:Q27096213\n}";

            return "PREFIX wd: <http://www.wikidata.org/entity/>\n" +
                "SELECT DISTINCT ?uri ?type ?itName ?enName ?defaultName ?itDesc ?enDesc ?image " +
                "?birth ?death ?birthPlace ?deathPlace ?foundation ?foundation2 ?completion ?occupation ?position ?coordinatesPoint" +
                "\nWHERE {\n" +
                "VALUES ?uri {wd:" + qids.join(" wd:") + "}\n" +
                (force ? "" : types) +
                (force ? "OPTIONAL {?uri wdt:P31 ?class.\n}" : "?uri wdt:P31 ?class.\n") +
                (force ? "OPTIONAL {?class wdt:P279* ?type.\n " + types + "}" : "?class wdt:P279* ?type.\n") +
                "OPTIONAL { ?uri wdt:P18 ?image. }\n" +
                "OPTIONAL { ?uri wdt:P569 ?birth. }\n" +
                "OPTIONAL { ?uri wdt:P570 ?death. }\n" +
                "OPTIONAL { ?uri wdt:P19 ?birthPlace. }\n" +
                "OPTIONAL { ?uri wdt:P20 ?deathPlace. }\n" +
                "OPTIONAL { ?uri wdt:P571 ?foundation. }\n" +
                "OPTIONAL { ?uri wdt:P580 ?foundation2. }\n" +
                "OPTIONAL { ?uri wdt:P1619 ?completion. }\n" +
                "OPTIONAL { ?uri wdt:P106 ?occupation. }\n" +
                "OPTIONAL { ?uri wdt:P39 ?position. }\n" +
                "OPTIONAL { ?uri wdt:P625 ?coordinatesPoint. }\n" +
                "OPTIONAL { ?uri rdfs:label ?itName filter (lang(?itName) = 'it'). }\n" +
                "OPTIONAL { ?uri rdfs:label ?enName filter (lang(?enName) = 'en'). }\n" +
                "OPTIONAL { ?uri rdfs:label ?defaultName. }\n" +    // generic label without lang filter
                "OPTIONAL { ?uri schema:description ?itDesc filter (lang(?itDesc) = 'it'). }\n" +
                "OPTIONAL { ?uri schema:description ?enDesc filter (lang(?enDesc) = 'en'). }\n" + "\n\} limit 50000";
        }

        document.addEventListener("click", function (event) {
            let dropdown = document.getElementById("suggestions-dropdown");
            if (dropdown && !inputElement.contains(event.target) && !dropdown.contains(event.target)) {
                dropdown.innerHTML = "";
                dropdown.style.display = "none";
            }
        });

    } // end of customAnn.html page

    // theme toggle when the latest elements are ready
    let selector;
    isCustomAnn ? selector = '#canvas-scene' : selector = '#ARButton';

    onElementReady(selector, () => {

        const toggle = document.getElementById('theme-toggle');

        fetch('./PHP/getThemePreference.php')
            .then(res => res.json())
            .then(data => {
                applyTheme(data.theme || 'dark');
            });

        toggle.addEventListener('change', () => {
            const theme = toggle.checked ? 'light' : 'dark';
            applyTheme(theme);
            fetch('./PHP/saveThemePreference.php', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({theme})
            }).then(response => {
                if (!response.ok) throw new Error(`Error changing theme: ${response.error}`);
                else console.log("Theme changed to " + theme + ".");
                return response.text();
            });
            refreshTheme(theme);
        });

    });

}