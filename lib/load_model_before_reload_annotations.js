import {BlobReader, BlobWriter, ZipReader, ZipWriter,} from "https://deno.land/x/zipjs/index.js";
import * as THREE from './three.module.js';
import {OrbitControls} from './addons/OrbitControls.js';
import {GLTFLoader} from './loaders/GLTFLoader.js';
import {CSS2DObject, CSS2DRenderer} from './renderers/CSS2DRenderer.js';
import {CSS3DObject, CSS3DRenderer} from './renderers/CSS3DRenderer.js';
import JEASINGS from 'https://esm.sh/jeasings';
import {ARButton} from './webxr/ARButton.js';

// global variables
let indexContainer = document.getElementById('index-container');
let isCustomAnn = false;  // boolean for custom annotation page
let isCrosshair = false;
let json_data;
let model;
let modelName;
let modelUID;
let positionsOriginal;
let positionsNormalized;
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

function hideLoader() {
    document.getElementById('loader').style.display = 'none';
}

async function loadLocalFile(filePath) {
    const response = await fetch(filePath);
    return await response.blob();
}

async function saveZip(zipBlob, modelName) {
    const formData = new FormData();

    try {
        await formData.append('file', zipBlob, modelName.slice(0, -4) + '.zip'); // ensure that .glb is not in the name
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

async function extractZip(zipBlob) {
    const zipReader = await new ZipReader(await new BlobReader(zipBlob));

    try {
        const entries = await zipReader.getEntries();
        for (const entry of entries) {
            console.log(`Extracting: ${entry.filename}`);
            if (!entry.directory) {
                const blobWriter = await new BlobWriter();
                const fileBlob = await entry.getData(blobWriter);

                // Save the extracted .glb file locally
                await saveGLB(fileBlob, entry.filename);
            }
        }
    } catch (error) {
        console.error('Error while extracting ZIP:', error);
    } finally {
        await zipReader.close();
    }
}

async function createZip(chosenModel) {
    try {
        // Write ZIP
        const modelName = chosenModel;
        const modelFileBlob = await loadLocalFile("./PHP/3D_models/" + modelName);

        const modelFileReader = await new BlobReader(modelFileBlob);

        const zipFileWriter = await new BlobWriter();

        const zipWriter = await new ZipWriter(zipFileWriter);
        await zipWriter.add(modelName, modelFileReader);
        await zipWriter.close();

        const zipFileBlob = await zipFileWriter.getData();

        // Save ZIP
        const saveResult = await saveZip(zipFileBlob, modelName);

        if (saveResult) {
            await extractZip(zipFileBlob);
        }

        return modelName;

    } catch (e) {
        console.log(e);
    }
}

async function changeBody(chosenModel) {
    try {

        return await createZip(chosenModel);

    } catch (e) {
        console.log(e);
    }
}

// get model name from URL parameter
function getParamValue (paramName) {
    let url = window.location.search.substring(1); // get rid of "?" in querystring

    let args = url.split('&'); // split arguments

    for (let i = 0; i < args.length; i++) {

        let pArr = args[i].split('='); // split key and value
        if (pArr[0] === paramName) {    // if the argument corresponds to the given parameter name return the value
            return pArr[1];
        }

    }

    return null;
}

let chosenModel = getParamValue('model');

let customAnn = getParamValue('custom');

if (customAnn) {
    isCustomAnn = true;
}

if (!chosenModel) {

    throw new Error('No model found.');

} else {

    // if file is a zip, extract it and load the model, otherwise load the model, create a zip and delete the .glb file
    const extension = chosenModel.slice(-4);

    if (extension === '.zip') {

        try {
            modelName = chosenModel;

            const zipFileBlob = await loadLocalFile("./PHP/3D_models/" + modelName);

            await extractZip(zipFileBlob);
        } catch (e) {
            console.error(e);
        }

    } else if (extension === '.glb') {

        modelName = await changeBody(chosenModel);

    }

    // three.js scene - global variables
    let camera;
    let cameraZ;
    let cameraFov;
    let controls;
    let renderer;
    let modelScene;
    let mesh;
    let modelCenter;
    let raycaster = new THREE.Raycaster();
    let video;
    let annotationVec = [];
    let scale = 1;
    let box;
    let size;
    let lights = [];
    let label2DRenderer;
    let label3DRenderer;
    let annotation;
    let annotationListDiv;
    let annotationMeshList = [];
    let annotationIsDisplayed = false;
    let originalDistance = null;
    let zoomLevel;
    /*let videoTexture, videoSettings;
    let videoStream;*/
    let ARbutton;
    let controller;
    let tempMatrix = new THREE.Matrix4();
    let pointer = undefined;
    const clickableAreas = [];
    let planesArray = [];
    let canvasXR;
    let selectedObject = null;
    let initialControllerPosition = new THREE.Vector3();
    let isDragging = false;

    /*function initWebcam() {
        navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}}).then(function (stream) { // 'environment' means rear camera - replace with 'user' if you want to select front camera
            videoSettings = stream.getVideoTracks()[0].getSettings();
            video = document.createElement("video");
            video.setAttribute('id', 'video');
            video.setAttribute('autoplay', '');
            video.setAttribute('loop', '');
            video.setAttribute('muted', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('playsinline', '');
            document.body.appendChild(video);
            Object.assign(video, {
                srcObject: stream,
                height: videoSettings.height,
                width: videoSettings.width,
                autoplay: true
            });
            videoTexture = new THREE.VideoTexture(video);
            videoTexture.minFilter = THREE.LinearFilter;
            videoTexture.colorSpace = THREE.SRGBColorSpace;
            videoTexture.width = window.innerWidth;
            videoTexture.height = window.innerHeight;

            videoStream = stream;
        }).catch(function (error) {
            console.error(error);
        });
    }*/

    async function initXR() {

        // Camera
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);

        // Axes
        /*let axesHelper = new THREE.AxesHelper();
        scene.add(axesHelper);*/

        // Model
        const loader = new GLTFLoader();
        loader.crossOrigin = 'anonymous';
        await loader.load('./PHP/3D_models/' + modelName.slice(0, -4) + '.glb', async function(gltf) {
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
            // Calculate scale factor to resize model to human scale.
            scale = 1.6 / size.y;
            scale = 2.0 / size.x < scale ? 2.0 / size.x : scale;
            scale = 2.0 / size.z < scale ? 2.0 / size.z : scale;
            modelScene.scale.set(scale, scale, scale);
            gltf.scale = [scale, scale, scale];

            // Center model at 0, 0, 0
            modelScene.updateMatrixWorld();
            box = new THREE.Box3().setFromObject(modelScene);
            let center = box.getCenter(new THREE.Vector3());
            size = box.getSize(new THREE.Vector3());
            // Center model with respect to scene
            modelScene.position.x = -center.x;
            modelScene.position.y = -center.y;
            modelScene.position.z = -center.z;

            scene.add(modelScene);

            // Lights
            lights[0] = new THREE.AmbientLight();
            lights[1] = new THREE.DirectionalLight();
            lights[1].position.set(scale/3.5, scale/4.5, scale/3.5);
            lights[2] = new THREE.DirectionalLight();
            lights[2].position.set(-scale/3.5, -scale/4.5, -scale/3.5);
            lights[3] = new THREE.HemisphereLight(0xffffff, 0xffffbb, 1);

            scene.add(lights[0]);
            scene.add(lights[1]);
            scene.add(lights[2]);
            scene.add(lights[3]);

            // Camera
            box = new THREE.Box3().setFromObject(mesh);
            center = box.getCenter(new THREE.Vector3());
            size = box.getSize(new THREE.Vector3());

            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)));
            //cameraZ *= 1.5;
            camera.position.set(center.x + cameraZ / 2, center.y + cameraZ, center.z + cameraZ / 2);
            camera.lookAt(model);
            camera.updateProjectionMatrix();

            cameraFov = camera.fov;

            modelCenter = center;

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
            renderer.domElement.style.background = "linear-gradient(to bottom, #000000, #333333)"; // background CSS

            renderer.xr.addEventListener('sessionstart', updateModelScaleForXR);
            renderer.xr.addEventListener('sessionend', updateModelScaleForXR);

            // Controls - Zoom
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableZoom = true;
            controls.minDistance = 0.01;
            controls.maxDistance = 10;

            controls.addEventListener("change", getControlsZoom);

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
            await fetch('./json/' + modelName.slice(0, -4) + '.json')
                .then(response => response.json())
                .then(function (data) {

                    // store all json information in a global variable
                    json_data = data;

                    // iterate over events until the model ID is found
                    for (let property in data["events"]) {
                        if (Object.keys(data["events"][property]).includes('sketchfabid')) {
                            modelUID = data["events"][property]["sketchfabid"];
                        }
                    }

                    event_entities = data["entities"]; // keep props order

                }).catch(error => console.error('Error, model ID not found:', error,
                    "Please, check that the file .json is located in the correct folder and the names are the same."
                ));

            // get positions and normalized them - useful for sorting events in saveJSONAnnotations()
            positionsOriginal = extractPositions(json_data.events);
            positionsNormalized = normalizePositions(positionsOriginal);

            console.log("on load: ", positionsOriginal, positionsNormalized);

            // start sketchfab API
            await client.init(modelUID, {
                success: async function (api) {
                    api.start();
                    await api.addEventListener('viewerready', async function () {

                        await api.getAnnotationList(async function (err, annotations) {
                            if (!err) {

                                let annotationsPanel, ul, ulAnn;

                                // for incompatible devices with dom-overlay - HoloLens
                                // annotations are dynamically moved from this div to 2D/3D renderers
                                annotationListDiv = document.createElement('div');
                                annotationListDiv.setAttribute('id', 'annotation-list-div');
                                document.body.appendChild(annotationListDiv);
                                annotationListDiv.style.display = 'none';

                                if (!isCustomAnn) {

                                    const buttonsDiv = document.createElement('div');
                                    buttonsDiv.setAttribute('id', 'buttons-container');
                                    document.body.appendChild(buttonsDiv);

                                    const customButton = document.createElement('button');
                                    customButton.setAttribute('type', 'button');
                                    customButton.setAttribute('id', 'custom-annotations');
                                    customButton.setAttribute('value', 'Custom annotations');
                                    customButton.innerText = 'CUSTOM ANNOTATIONS';
                                    customButton.setAttribute('onclick', `window.open(\'customAnn.html?model=${modelName}&custom=true\', \'annotations\', \'width=1200,height=800,scrollbars=yes\');`); // add boolean argument that checks if we are in customize annotations page, so to disable unnecessary things like the legend and the AR button
                                    buttonsDiv.appendChild(customButton);

                                    // add the AR button to the body of the DOM and enable overlay functionality (for annotation panel)
                                    ARbutton = ARButton.createButton(renderer, {
                                        optionalFeatures: ['dom-overlay'],
                                        domOverlay: {root: document.getElementById('label-renderer-3d')}
                                    });
                                    buttonsDiv.appendChild(ARbutton);

                                    // initialise annotations panel for quick link to annotations
                                    annotationsPanel = document.getElementById('annotationsPanel');
                                    ul = document.createElement('ul');
                                    ul.setAttribute('id', 'annotation-list');
                                    ulAnn = annotationsPanel.appendChild(ul);

                                    const checkbox = document.createElement('input');
                                    checkbox.setAttribute('id', 'checkbox-filter');
                                    checkbox.setAttribute('type', 'checkbox');
                                    checkbox.setAttribute('value', 'Show panel');
                                    checkbox.setAttribute('checked', '');
                                    checkbox.addEventListener('change', function () {
                                        if (this.checked) {
                                            // show panel
                                            ul.style.visibility = 'visible';
                                        } else {
                                            // hide panel
                                            ul.style.visibility = 'hidden';
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

                                    // add "Download JSON" button
                                    const downloadButton = document.createElement('button');
                                    downloadButton.setAttribute('type', 'button');
                                    downloadButton.setAttribute('id', 'download-json');
                                    downloadButton.setAttribute('class', 'btn btn-default');
                                    downloadButton.textContent = 'Download JSON';
                                    downloadButton.addEventListener('click', function () {
                                        download(JSON.stringify(json_data, null, 2), modelName.slice(0, -4) + '.json');
                                    });
                                    document.getElementById('custom-buttons-container').appendChild(downloadButton);

                                    const addAnnotationButton = document.getElementById('add-annotation-button');
                                    const sceneContainer = document.getElementById('scene-container');

                                    addAnnotationButton.style.display = 'block';
                                    addAnnotationButton.addEventListener('click', (event) => {

                                        // invert the state
                                        isCrosshair = !isCrosshair;

                                        isCrosshair
                                            ? sceneContainer.style.cursor = 'crosshair'
                                            : sceneContainer.style.cursor = 'default';

                                    });

                                    // track click to place an annotation
                                    renderer.domElement.addEventListener('pointerdown', (event) => {

                                        // check if 'add annotation' button is clicked
                                        if (sceneContainer.style.cursor === 'crosshair') {

                                            const rect = renderer.domElement.getBoundingClientRect();

                                            raycaster.setFromCamera({
                                                x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
                                                y: -((event.clientY - rect.top) / rect.height) * 2 + 1
                                            }, camera);

                                            const intersects = raycaster.intersectObject(model, true);

                                            if (intersects.length > 0) {

                                                try {
                                                    let coordinates = intersects[0].point;

                                                    // create DOM element
                                                    const text = 'New annotation';
                                                    createAnnotationDOM(text, '', numberOfCanvas + 1, coordinates, false);

                                                    // create new canvas
                                                    let newAnnotationCanvas = createCanvas(numberOfCanvas);

                                                    let [spriteFront, spriteRear] = createSprite(newAnnotationCanvas, coordinates, numberOfCanvas, false);

                                                    numberOfCanvas++;

                                                    // generate the event ID
                                                    const eventName = getRandomEventID();

                                                    // add annotation to list div in HTML
                                                    addAnnotationToList(text, numberOfCanvas, coordinates, eventName);

                                                    // show form
                                                    document.getElementById('form-inner').style.display = 'block';

                                                    // get input fields
                                                    const [title, description, point, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, oldPosition, eventID] = getFormFields();

                                                    // fill annotation form
                                                    fillForm(title, description, point, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, coordinates, numberOfCanvas, oldPosition, eventID, eventName, true);

                                                    // save the new annotation
                                                    saveJSONAnnotations();

                                                    sceneContainer.style.cursor = 'default';
                                                    isCrosshair = !isCrosshair;

                                                    // display alert
                                                    showAlert('annotation-creation', 'Annotation created and saved successfully!', 'success');
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

                                annotations.forEach(function (ann) {
                                    let index = annotations.indexOf(ann);

                                    for (let i = 0; i < events.length; i++) {
                                        if ('annotationNumber3DModel' in events[i][1] && parseInt(events[i][1].annotationNumber3DModel) === index + 1) {
                                            let description = events[i][1].text?.text || events[i][1].description;

                                            // Get coordinates of the annotation (x, y, z)
                                            let thisAnn = new THREE.Vector3(
                                                ann.position[0],
                                                ann.position[1],
                                                ann.position[2]
                                            );

                                            annotationListTemp.push({
                                                index: positionsNormalized[positionsOriginal.indexOf(parseInt(events[i][1].position))],
                                                title: events[i][1].title,
                                                description: description,
                                                coordinates: thisAnn,
                                                isSketchfab: true,
                                                id: events[i][1]._id
                                            });
                                        }
                                    }
                                });

                                events.forEach(([key, value]) => {
                                    if (key.includes('customAnnotation')) {
                                        let title = value.text.headline;
                                        let description = value.text.text;
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
                                            isSketchfab: false,
                                            id: value._id
                                        });
                                    }
                                });

                                annotationListTemp.sort((a, b) => positionsNormalized.indexOf(a.index) - positionsNormalized.indexOf(b.index));
                                annotationListTemp.sort((a, b) => a.index - b.index);

                                annotationListTemp.forEach((ann, index) => {

                                    // create DOM element
                                    createAnnotationDOM(ann.title, ann.description, index + 1, ann.coordinates, ann.isSketchfab);

                                    // Number
                                    let annotationCanvas = createCanvas(index);
                                    numberOfCanvas++;

                                    // Sprites - circles and numbers
                                    let [spriteFront, spriteRear] = createSprite(annotationCanvas, ann.coordinates, index, ann.isSketchfab);

                                    if (isCustomAnn) {
                                        // annotations list
                                        addAnnotationToList(ann.title, index + 1, ann.coordinates, ann.id);
                                    } else {
                                        // add annotation button in annotationsPanel
                                        appendButtonToPanel(index, spriteFront, renderer, ann.title, ulAnn);
                                    }
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

                                    if (intersects.length > 0) {

                                        isCustomAnn
                                            ? sceneContainer.style.cursor = 'pointer'
                                            : document.body.style.cursor = 'pointer';

                                    } else {

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
                                        if (!renderer.xr.getSession()) {
                                            gotoAnnotation(intersects[0].object.name - 1, intersects[0].point, false);
                                        } else {
                                            gotoAnnotation(intersects[0].object.name - 1, intersects[0].point, true);
                                        }
                                    }
                                });

                                renderer.domElement.addEventListener("dblclick", function(event) {
                                    hideAnnotations();
                                    changeCameraPosition(event, raycaster);
                                });

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
                                const laser = new THREE.Line(laserGeometry, laserMaterial);
                                laser.scale.z = 4; // laser length
                                controller.add(laser);

                                controller.addEventListener('select', () => {

                                    tempMatrix.identity().extractRotation(pointer.matrixWorld);

                                    let raycaster = new THREE.Raycaster();
                                    raycaster.camera = renderer.xr.getCamera().cameras[0];
                                    raycaster.ray.origin.setFromMatrixPosition(pointer.matrixWorld);
                                    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

                                    // intersect with annotations
                                    // select all sprites
                                    let allAnnotations = model.children.filter(child => child.type === 'Sprite');

                                    let intersects = raycaster.intersectObjects(allAnnotations);
                                    if (intersects.length > 0) {
                                        gotoAnnotation(intersects[0].object.name - 1, intersects[0].point, true);
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

                                //let thisMaterial = null;

                                controller.addEventListener('selectstart', () => {
                                    console.log('selectstart');
                                    tempMatrix.identity().extractRotation(pointer.matrixWorld);

                                    let raycaster = new THREE.Raycaster();
                                    raycaster.camera = renderer.xr.getCamera().cameras[0];
                                    raycaster.ray.origin.setFromMatrixPosition(pointer.matrixWorld);
                                    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

                                    //let draggableObjects = findDraggableObjects(modelScene);
                                    let intersects = raycaster.intersectObject(modelScene);

                                    if (intersects.length > 0) {
                                        console.log('intersects');
                                        /*selectedObject = intersects[0].object;
                                        thisMaterial = selectedObject.material.emissive;
                                        selectedObject.material.emissive = new THREE.Color(0x008000); // green
                                        controller.attach(selectedObject);*/
                                        controller.getWorldPosition(initialControllerPosition);
                                        selectedObject = intersects[0].object;
                                        isDragging = true;
                                    }

                                });

                                controller.addEventListener('selectend', () => {
                                    console.log('selectend');
                                    //if (isDragging && selectedObject) {
                                    /*scene.attach(selectedObject);
                                    selectedObject.material.emissive = thisMaterial;
                                    selectedObject = null;*/
                                    isDragging = false;
                                    selectedObject = null;
                                    //}
                                });

                            } else {
                                console.error('Error while retrieving annotation:', err);
                            }
                        });

                        hideLoader();

                    });
                },
                error: function (error) {
                    console.error('Error while loading the Sketchfab model:', error);
                }
            });
            // end sketchfab API
            // end viewer

            // end annotations

            // remove glb file
            /*const formData = new FormData();
            formData.append('filePath', './3D_models/' + modelName.slice(0, -4) + '.glb'); // ensure that the glb file will be removed in any case

            await fetch('./PHP/removeGLB.php', {
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
            });*/

        }, undefined, function (error) {
            console.error(error);
        });

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

        // resize video stream
        /*videoTexture.width = window.innerWidth;
        videoTexture.height = window.innerHeight;
        videoSettings.width = window.innerWidth;
        videoSettings.height = window.innerHeight;*/
    }

    function animate() {
        if (isDragging) { // && selectedObject
            const controllerWorldPosition = new THREE.Vector3();
            controller.getWorldPosition(controllerWorldPosition);
            const delta = new THREE.Vector3().subVectors(controllerWorldPosition, initialControllerPosition);

            // apply a scale factor for non-HoloLens devices
            if (renderer.xr.getSession().domOverlayState) {

                const scaleFactor = 4.5;
                modelScene.position.add(delta.multiplyScalar(scaleFactor));

            } else {

                if (selectedObject !== null) {
                    if (selectedObject.name === "planeFront" || selectedObject.name === "planeBack") {
                        selectedObject.parent.position.add(delta); // select the THREE.Group parent of the single plane
                    } else {
                        modelScene.position.add(delta);
                    }
                }

            }
            initialControllerPosition.copy(controllerWorldPosition);
            //selectedObject.position.copy(controllerWorldPosition);
        }
        controls.update();
        JEASINGS.update();
        render();
    }

    function render() {
        renderer.render(scene, camera);
        let xr = renderer.xr.isPresenting;

        if (xr) {
            //camera.position.set(0, 0, 0);
            //let session = renderer.xr.getSession();
            /*if (typeof session.onsqueezestart === undefined) {
                session.onsqueezestart = onSqueezeEvent;
                session.onsqueeze = onSqueezeEvent;
                session.onsqueezeend = onSqueezeEvent;
            }*/
            label3DRenderer.render(scene, camera);
        } else {
            label2DRenderer.render(scene, camera);
        }

        if (annotationIsDisplayed) {
            updateScreenPosition(xr);
        }

    }

    function createSprite(canvas, point, number, isSketchfab) {

        // calculate a new scale for non-sketchfab annotations, since they are added directly to the scene rather than the model
        let newScale;
        isSketchfab
            ? newScale = scale*0.01
            : newScale = scale*(scale*0.01);

        const annotationVector = new THREE.Vector3(point.x, point.y, point.z);
        const numberTexture = new THREE.CanvasTexture(canvas);

        const spriteMaterialFront = new THREE.SpriteMaterial({
            map: numberTexture
        });

        let spriteFront = new THREE.Sprite(spriteMaterialFront);
        spriteFront.position.copy(annotationVector);
        spriteFront.scale.set(newScale, newScale, newScale);
        spriteFront.name = number+1;
        spriteFront.userData.frontOrRear = 'front';

        const spriteMaterialRear = new THREE.SpriteMaterial({
            map: numberTexture,
            opacity: 0.3,
            transparent: true,
            depthTest: false
        });

        let spriteRear = new THREE.Sprite(spriteMaterialRear);
        spriteRear.position.copy(annotationVector);
        spriteRear.scale.set(newScale, newScale, newScale);
        spriteRear.name = number+1;
        spriteRear.userData.frontOrRear = 'rear';

        // if annotation comes from Sketchfab then add it to the model, otherwise add it to the scene
        // that is because custom annotations save the absolute position in the scene, while Sketchfab has a different system
        isSketchfab
            ? model.add(spriteFront, spriteRear)
            : scene.add(spriteFront, spriteRear);

        return [spriteFront, spriteRear];
    }

    function hideAnnotations () {
        annotation = model.children.filter(child => child.isCSS2DObject);
        annotation.forEach(function (el) {
            el.visible = false;
        });

        annotation = model.children.filter(child => child.isCSS3DObject);
        annotation.forEach(function (el) {
            el.visible = false;
        });

        annotationMeshList.forEach(function (meshGroup) {
            meshGroup.visible = false;
        });

        annotationIsDisplayed = false;
    }

    function removeAnnotations() {
        scene.children = scene.children.filter(child => {
            if (child.isCSS2DObject) {
                child.removeFromParent();
                return false;
            }
            return true;
        });

        model.children = model.children.filter(child => {
            if (child.isCSS2DObject) {
                child.removeFromParent();
                return false;
            }
            return true;
        });

        scene.children = scene.children.filter(child => {
            if (child.isCSS3DObject) {
                child.removeFromParent();
                return false;
            }
            return true;
        });

        model.children = model.children.filter(child => {
            if (child.isCSS3DObject) {
                child.removeFromParent();
                return false;
            }
            return true;
        });

        annotationMeshList.forEach(meshGroup => {
            if (meshGroup.parent) {
                meshGroup.removeFromParent();
            }
            scene.remove(meshGroup);
        });
        annotationMeshList.length = 0;

        annotationIsDisplayed = false;
    }


    function updateScreenPosition(isXR) {

        let thisCamera;

        if (isXR) {
            thisCamera = renderer.xr.getCamera(camera);
        } else {
            thisCamera = camera;
        }

        const canvas = renderer.domElement;
        const sprites = getAllSprites(scene, true);

        // re-order sprites to match the annotation list order in DOM
        sprites.sort((a, b) => a.name - b.name);

        for (let i=0; i<sprites.length; i++) {
            const target = new THREE.Vector3();
            let vector = sprites[i].getWorldPosition(target);

            vector.project(thisCamera);

            vector.x = Math.round((0.5 + vector.x / 2) * (canvas.width / window.devicePixelRatio));
            vector.y = Math.round((0.5 - vector.y / 2) * (canvas.height / window.devicePixelRatio));

            annotationList[i].style.top = `${vector.y}px`;
            annotationList[i].style.left = `${vector.x}px`;

            let newMargin = vector.x * zoomLevel;
            annotationList[i].style.marginTop = `${newMargin}px`;
            annotationList[i].style.marginLeft = `${newMargin}px`;

            if (isXR) {
                annotationList[i].style.transform = `translate(-50%, -50%) translate(${vector.x/1.2}px, ${vector.y/3}px)`;
                annotationList[i].style.width = '85%';
            } else {

                let containerRect;

                isCustomAnn
                    ? containerRect = document.getElementById('scene-container').getBoundingClientRect()
                    : containerRect = document.getElementById('index-container').getBoundingClientRect();

                annotationList[i].style.transform = 'none';
                annotationList[i].style.width = 'auto';
                annotationList[i].style.height = 'auto';
                annotationList[i].style.maxWidth = `${containerRect.width / 2 - newMargin - 10}px`;
                annotationList[i].style.maxHeight = `${(containerRect.height / 2) - (newMargin * 0.8)}px`;
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

    function getControlsZoom() {
        if (originalDistance == null) originalDistance = controls.getDistance();

        zoomLevel = originalDistance / controls.getDistance();
        zoomLevel = Math.round(zoomLevel * 1e4) / 1e4;
        zoomLevel /= 150;

    }

    function gotoAnnotation(i, point, isXR) {

        hideAnnotations();

        const name = i+1;

        if (!isXR) {
            let all2DAnnotations = model.children.filter(child => child.isCSS2DObject);

            new JEASINGS.JEasing(camera.position)
                .to(
                    {
                        x: point.x,
                        y: point.y + 0.1,
                        z: point.z + 0.2
                    },
                    500
                )
                .easing(JEASINGS.Cubic.Out)
                .start();

            new JEASINGS.JEasing(controls.target)
                .to(
                    {
                        x: point.x,
                        y: point.y,
                        z: point.z
                    },
                    500
                )
                .easing(JEASINGS.Cubic.Out)
                .start();

            // show selected annotation
            all2DAnnotations.forEach(function (ann) {
                if (ann.name === String(name)) {
                    // show annotation
                    ann.visible = true;

                    // ensure that visualization is always on top
                    let element = document.querySelector(`[data-before="${name}"]`);
                    if (element) {
                        element.style.display = 'block'; // this is required for scrollTop to work properly
                        element.scrollTop = 0;
                    }
                }
            });

        } else {

            let all3DAnnotations = model.children.filter(child => child.isCSS3DObject);

            // show selected annotation
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
                                let thisAnn = undefined;

                                for (let y=0; y<scene.children.length; y++) {

                                    if (scene.children[y].name === String(name)) {
                                        annotationExists = true;
                                        thisAnn = scene.children[y];
                                    }
                                }

                                if (annotationExists) {

                                    thisAnn.visible = true;
                                    ann.position.set(-(scale / 10 * 2), 0, 0);

                                } else {

                                    let a = createAnnotationPlane(annotations[i], ann.name);
                                    a.visible = true;

                                }
                            }
                        }
                    }
                }
            });

        }

        annotationIsDisplayed = true;
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
            new JEASINGS.JEasing(controls.target)
                .to(
                    {
                        x: p.x,
                        y: p.y,
                        z: p.z
                    },
                    500
                )
                .easing(JEASINGS.Cubic.Out)
                .start();

        } else {    // if click is outside the model restore the default camera position and target

            new JEASINGS.JEasing(camera.position)
                .to(
                    {
                        x: modelCenter.x + cameraZ / 2,
                        y: modelCenter.y + cameraZ,
                        z: modelCenter.z + cameraZ / 2
                    },
                    500
                )
                .easing(JEASINGS.Cubic.Out)
                .start();

            new JEASINGS.JEasing(controls.target)
                .to(
                    {
                        x: 0,
                        y: 0,
                        z: 0
                    },
                    500
                )
                .easing(JEASINGS.Cubic.Out)
                .start();

        }
    }

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

        // Height
        let totalHeight = 0;
        lineHeight = 80; // title height
        totalHeight += calculateHeight(htmlElement.querySelector('.annotation-title').textContent, titleFont);
        lineHeight = 30; // text height
        totalHeight += calculateHeight(htmlElement.querySelector('.annotation-description').querySelector('p').textContent, textFont);
        lineHeight = 40; // subtitle height
        totalHeight += calculateHeight(htmlElement.querySelector('h5').textContent, subtitleFont);
        lineHeight = 30; // text height
        const entities = htmlElement.querySelectorAll('.tl-entities a');
        for (const entity of entities) {
            totalHeight += calculateHeight(entity.textContent, textFont);
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
        let text = htmlElement.querySelector('.annotation-title').textContent;
        context.font = titleFont;
        lineHeight = 80; // title height
        let lines = wrapText(context, text, maxTextWidth);
        for (const line of lines) {
            context.fillText(line, padding, y);
            y += lineHeight;
        }

        // Description
        text = htmlElement.querySelector('.annotation-description').querySelector('p').textContent;
        context.font = textFont;
        lineHeight = 30; // text height
        lines = wrapText(context, text, maxTextWidth);
        for (const line of lines) {
            context.fillText(line, padding, y);
            y += lineHeight;
        }

        // Subtitle
        text = htmlElement.querySelector('h5').textContent;
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

        const aspectRatio = canvasXR.width / canvasXR.height;
        const planeHeight = 0.5;
        const planeWidth = planeHeight * aspectRatio;

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

        group.position.copy(model.position); // .set(-(scale / 10 * 2), 0, 0);
        group.position.x = -(scale / 10 * 2);
        group.name = name;
        modelScene.add(group);

        annotationMeshList.push(group);

        return group;
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

    function onSelectStart(event) {
        pointer = event.target;
    }

    function onSelectEnd(event) {
        pointer = undefined;
    }

    function updateModelScaleForXR() {
        const isImmersiveAR = renderer.xr.isPresenting;

        if (modelScene) {
            if (isImmersiveAR) {
                const arScaleFactor = 0.6;
                modelScene.scale.set(scale * arScaleFactor, scale * arScaleFactor, scale * arScaleFactor);
            } else {
                modelScene.scale.set(scale, scale, scale);
            }
            model.position.set(0, 0, 0);
            modelScene.updateMatrixWorld();
        }
    }

    function setSceneSize(renderer) {
        // if the page is the custom annotation one, set renderer size less than window width
        if (isCustomAnn) {
            const width = document.getElementById('scene-container').clientWidth;
            const height = document.getElementById('scene-container').clientHeight;

            renderer.setSize(width, height);
        } else {
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    function createAnnotationDOM(title, description, index, position, isSketchfab) {
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

        // set isSketchfab flag
        isSketchfab
            ? annotationDiv.setAttribute('is-sketchfab', 'true')
            : annotationDiv.setAttribute('is-sketchfab', 'false');

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

                props_temp = new Map;

                // get input fields
                const [title, description, coordinates, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, oldPosition, eventID] = getFormFields();

                // show form
                document.getElementById('form-inner').style.display = 'block';

                const annotationID = e.target.closest('.annotation-item').querySelector('.annotation-id').textContent;

                fillForm(title, description, coordinates, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, point, i, oldPosition, eventID, annotationID,false);

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
        return [title, description, coordinates, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, oldPosition, eventID];
    }

    function fillForm(title, description, coordinates, position, digobjurl, digobjtitle, digobjtable, entities, entitiesDiv, point, positionInList, oldPositionInList, eventID, annotationID, initializeAnnotation) {

        // empty digital object table
        digobjtable.textContent = '';

        // empty entities div
        entitiesDiv.textContent = '';

        // retrieve the annotation number
        let annotationNumber;
        initializeAnnotation ? annotationNumber = positionInList : annotationNumber = getNormalizedValue(json_data.events[annotationID].position);

        // fill in the information
        eventID.value = annotationID;
        oldPositionInList.textContent = annotationNumber;
        coordinates.value = point.x + "," + point.y + "," + point.z;
        position.value = annotationNumber;

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
                    addDigitalObject(digobjurlValue, digobjtitleValue);
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
                    thisEntity.title ? entityTitle = thisEntity.title : entityTitle = thisEntity.enName;   // set default title to english version
                    addEntity(thisEntity, entityTitle, entityClass, keys[i], undefined);
                }
            }

        }
    }

    function appendButtonToPanel(index, spriteFront, renderer, title, ulAnn) {
        const li = document.createElement('li');
        const liAnn = ulAnn.appendChild(li);
        const button = document.createElement('button');
        button.textContent = index + 1 + ' : ' + title;
        button.className = 'annotationButton';
        button.addEventListener('mousedown', function () {
            spriteFront.updateMatrixWorld();
            let target = new THREE.Vector3();
            if (!renderer.xr.getSession()) {
                gotoAnnotation(index, spriteFront.getWorldPosition(target), false);
            } else {
                gotoAnnotation(index, spriteFront.getWorldPosition(target), true);
            }
        });
        liAnn.appendChild(button);
    }

    //initWebcam();
    console.log("initXR result:", initXR());

}

function getRandom13DigitNumber() {
    const min = 10n ** 12n; // 1 followed by 12 zeros
    const max = (10n ** 13n) - 1n; // 1 followed by 13 zeros minus 1
    return BigInt(Math.floor(Math.random() * Number(max - min + 1n)) + Number(min));
}

// add new annotation as event in the json file
function saveJSONAnnotations() {
    try {
        const eventID = document.getElementById('event-id').value;
        const events = json_data.events;
        const position = document.getElementById('position').value;

        console.log("before saving: ", positionsOriginal, positionsNormalized);

        if (!(eventID in events)) {
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
                "position": positionsOriginal.at(-1)+1,
                "unique_id": "",
                "eventMedia": "",
                "eventVideo": "",
                "start_date": {
                    "day": "",
                    "year": null,
                    "month": ""
                },
                "description": "",
                "sketchfabid": "",
                "eventMediaCaption": "",
                "eventVideoCaption": "",
                "annotationNumber3DModel": "",
                'coordinates': null
            };

            positionsOriginal = extractPositions(json_data.events);
            positionsNormalized = normalizePositions(positionsOriginal);

        }

        // get information
        const title = document.getElementById('title').value;
        const description = document.getElementById('description').value;
        const coordinates = document.getElementById('coordinates').value; // TODO - add a field in SMBVT JSON generated file with coordinates
        const oldPosition = document.getElementById('old-position').textContent;

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
        events[eventID].text.text = annotationDescription.innerHTML; // with HTML code - TODO (build the string with tag elements)
        events[eventID].formType = 'sketchfab';
        events[eventID].description = description; // pure text
        if (events[eventID].sketchfabid === "") events[eventID].sketchfabid = modelUID;
        // digital objects
        if (arrayDigObj.length > 0) {
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
        props_temp = new Map;

        // convert coordinates string to a vector
        const coordinatesVector = coordinates.split(',');
        events[eventID].coordinates = new THREE.Vector3(
            parseFloat(coordinatesVector[0]),
            parseFloat(coordinatesVector[1]),
            parseFloat(coordinatesVector[2])
        );

        // update object 3D and 2D content
        // update title and description
        annotationScene.querySelector('.annotation-title').textContent = title;
        annotationDescription.textContent = description;
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

        // update digital object global variable
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
                    for (let j=0; j < entries.length; j++) {
                        if (getNormalizedValue(entries[j][1].position) === parseInt(position)) {
                            swapPositionValues(events, entries[j][1]._id, entries[i][1]._id);
                        }
                    }
                }
            }

            let oldSprites = [...model.children, ...scene.children].filter(child =>
                (child.name === oldPosition || child.name === parseInt(oldPosition)) && child.isSprite
            );

            let newSprites = [...model.children, ...scene.children].filter(child =>
                (child.name === position || child.name === parseInt(position)) && child.isSprite
            );
            updateSpriteNumbers(newSprites, parseInt(oldPosition));
            updateSpriteNumbers(oldSprites, parseInt(position));

            positionsOriginal = extractPositions(json_data.events);
            positionsNormalized = normalizePositions(positionsOriginal);

        }

        // save file
        saveJson(modelName, json_data);

        document.getElementById('old-position').textContent = position;

        console.log("after saving: ", positionsOriginal, positionsNormalized);

        // display alert
        showAlert('annotation-saved', 'Changes saved successfully!', 'success', 1500);
    } catch (e) {
        showAlert('error', 'Error:' + e, 'danger', 2000);
        console.error('Error saving JSON file:', e);
    }
}

function saveJson(modelName, json_data) {
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
            console.error("Error while saving JSON annotations file:", error);
        });
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
    alertDiv.className = `alert alert-${level} fade show ${id}`;
    alertDiv.setAttribute("role", "alert");
    alertDiv.innerHTML = `<span class='not-selectable'>${message}</span>`;

    let alertPlaceholder = document.getElementById("alert-placeholder");
    alertPlaceholder.innerHTML = "";
    alertPlaceholder.appendChild(alertDiv);

    alertDiv.style.display = "block";
    alertDiv.style.opacity = "1";

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

function extractPositions(container) {
    return Object.values(container).map(item => item.position);
}

function normalizePositions(originalPositions) {
    let sortedPositions = [...originalPositions].sort((a, b) => a - b);
    let positionMap = new Map(sortedPositions.map((pos, index) => [pos, index + 1]));
    return originalPositions.map(pos => positionMap.get(pos));
}

// values are normalized because "position" considers all types of events from SMBVT, while here we are only interested in 3D
function getNormalizedValue(originalValue) {
    let index = positionsOriginal.indexOf(originalValue);
    return index !== -1 ? positionsNormalized[index] : null;
}

function swapAnnotations(el1, el2) {
    if (!el1 || !el2) return;

    let temp = document.createElement("div");

    el1.replaceWith(temp);
    el2.replaceWith(el1);
    temp.replaceWith(el2);
}

function swapPositionValues(mainObject, key1, key2) {
    try {
        [mainObject[key1].position, mainObject[key2].position] = [mainObject[key2].position, mainObject[key1].position];
    } catch (e) {
        console.error("Error swapping positions: ", e);
    }
}

function sortEntries(entries, positionsOriginal, positionsNormalized) {
    let positionMap = new Map(positionsOriginal.map((pos, index) => [pos, positionsNormalized[index]]));

    return entries.sort((a, b) => positionMap.get(a[1].position) - positionMap.get(b[1].position));
}

function createCanvas(number) {

    let canvas = document.createElement('canvas');

    canvas.setAttribute('class', 'number');
    canvas.setAttribute('width', '64');
    canvas.setAttribute('height', '64');

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

    ctx.strokeStyle = "rgb(255, 255, 255)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();

    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${number+1}`, x, y);

    return canvas;
}

function updateSpriteNumbers(sprites, pos) {
    sprites.forEach((sprite) => {
        let canvas = createCanvas(pos-1);
        let newTexture = new THREE.CanvasTexture(canvas);

        sprite.material.map = newTexture;
        sprite.material.map = newTexture;
        newTexture.needsUpdate = true;
    });
}

function deleteAnnotation() {
    try {
        // find this annotation in the list
        const annotationInList = annotationClicked;

        // update json_data
        for (let property in json_data["events"]) {
            const title = json_data["events"][property]["text"]["headline"];
            const thisTitle = annotationInList.querySelector('.annotation-name').textContent;
            if (title === thisTitle) delete json_data["events"][property];
        }

        // save file
        saveJson(modelName, json_data);

        // remove annotation from list
        annotationInList.remove();

        // remove sprite from scene
        let allAnnotations = getAllSprites(scene);
        let thisNumber = annotationInList.getAttribute('annotation-number');
        allAnnotations.forEach(ann => {
            if (ann.name === parseInt(thisNumber)) {
                ann.parent.remove(ann);
            }
        });

        // decrease number of canvas
        numberOfCanvas--;

        // hide form
        document.getElementById('form-inner').style.display = 'none';

        // remove from array
        for (let i = 0; i < annotationList.length; i++) {
            if (i === ((thisNumber) - 1)) {
                annotationList.splice(i, 1);
            }
        }

        // remove all nodes from DOM
        const allNodes = document.querySelectorAll(`[data-before="${thisNumber}"]`);
        allNodes.forEach(node => {
            node.remove();
        })

        // remove 3D and 2D annotation from the scene
        removeCSS3DObject(thisNumber);
        removeCSS2DObject(thisNumber);

        // display alert
        showAlert('annotation-deleted', 'Annotation deleted.', 'primary', 1500);
    } catch (e) {
        showAlert('error', 'Error:' + e, 'error', 2000);
    }
}

function removeCSS3DObject(index) {
    // sketchfab ann
    let thisAnn = model.children.filter(child => child.isCSS3DObject && child.name === index);
    thisAnn.forEach(child => {
        child.remove();
        scene.remove(child);
        model.remove(child);
        child.element = null;
    });

    // non-sketchfab ann
    thisAnn = scene.children.filter(child => child.isCSS3DObject && child.name === index);
    thisAnn.forEach(child => {
        child.remove();
        scene.remove(child);
        model.remove(child);
        child.element = null;
    });
}

function removeCSS2DObject(index) {
    // sketchfab ann
    let thisAnn = model.children.filter(child => child.isCSS2DObject && child.name === index);
    thisAnn.forEach(child => {
        child.remove();
        scene.remove(child);
        model.remove(child);
        child.element = null;
    });

    // non-sketchfab ann
    thisAnn = scene.children.filter(child => child.isCSS2DObject && child.name === index);
    thisAnn.forEach(child => {
        child.remove();
        scene.remove(child);
        model.remove(child);
        child.element = null;
    });
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
    const random13DigitNumber = getRandom13DigitNumber().toString();
    return 'customAnnotation' + random13DigitNumber;
}

function addDigitalObject(inputValue, inputValue2, auto) {
    try {
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
            addDigitalObject('http://' + inputValue, inputValue2, auto);
        } else if (!auto) {
            const inputUrlGroup = document.getElementById('digobj-url').closest('.input-group');
            inputUrlGroup.classList.add('has-error');

            const inputTitleGroup = document.getElementById('digobj-title').closest('.input-group');
            inputTitleGroup.classList.add('has-error');
        }
    }
}

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
        deleteSymbol.textContent = "×";
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
    let characterWidth = 10;

    let maxLength = Math.floor(containerWidth / characterWidth);

    if (textElement) {
        textElement.innerHTML = truncate(originalText, maxLength);
    }
}

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

function addEntity(props, text, type, id, entityLoaderDiv) {
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
    selectedItem.style.backgroundColor = getColor(type);
    selectedItem.style.boxShadow = "2px 2px 3px lightgrey";
    selectedItem.style.color = "black";
    selectedItem.style.cursor = "pointer";
    selectedItem.style.maxWidth = "200px";
    selectedItem.style.overflow = "hidden";
    selectedItem.style.whiteSpace = "nowrap";
    selectedItem.style.textOverflow = "ellipsis";
    selectedItem.style.position = "relative";

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
    removeButton.innerText = "×";
    removeButton.style.marginLeft = "8px";
    removeButton.style.color = "red";
    removeButton.style.cursor = "pointer";
    removeButton.style.flexShrink = "0";
    removeButton.addEventListener("click", function (event) {
        event.stopPropagation();
        selectedItem.parentNode.removeChild(selectedItem);

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

function showModal(title, text, btnCancel, btnOK, callbackCancel, callbackOK, classButton='btn-primary') {

    // fill HTML modal information
    const modal = document.getElementById('modal-container');
    const modalTitle = modal.querySelector('#modal-title');
    const modalMessage = modal.querySelector('.modal-body');
    const modalCancel = modal.querySelector('#modal-dismiss');
    const modalConfirm = modal.querySelector('#modal-confirm');
    modalTitle.textContent = title;
    modalMessage.textContent = text;
    modalCancel.textContent = btnCancel;
    modalConfirm.textContent = btnOK;

    // add listener to buttons
    modalCancel.addEventListener('click', callbackCancel);
    modalConfirm.addEventListener('click', callbackOK);

    // change class of confirm button
    modalConfirm.classList.remove(...modalConfirm.classList); // remove all classes
    modalConfirm.classList.add('btn');
    modalConfirm.classList.add(classButton);

}

function removeModalListener() {
    const modal = document.getElementById('modal-container');
    const modalCancel = modal.querySelector('#modal-dismiss');
    const modalConfirm = modal.querySelector('#modal-confirm');

    modalCancel.removeEventListener('click', callbackCancel);
    modalConfirm.removeEventListener('click', callbackOK);
}

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
    if (type === "event") return "rgb(200, 255, 200)";
    if (type === "person") return "#dba2e7";
    if (type === "organization") return "#eda5bd";
    if (type === "object") return "#f5afa9";
    if (type === "concept") return "#ffe2df";
    if (type === "place") return "#f5c695";
    if (type === "work") return "#f2eb96";
    if (type === "other") return "rgb(255, 255, 255)";
}

// functions globally available
window.saveJSONAnnotations = saveJSONAnnotations;
window.deleteAnnotation = deleteAnnotation;
window.addDigitalObject = addDigitalObject;
window.displayDigObjTooltip = displayDigObjTooltip;
window.confirmDeleteDigObj = confirmDeleteDigObj;

window.addEventListener('resize', function () {
    selectDigObjs();
}, true);

if (document.readyState === "complete") {
    // initialize tooltips - for customAnn.html
    let tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'));
    tooltipTriggerList.forEach(function (tooltipTriggerEl) {
        new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // wikidata item suggestions - for customAnn.html
    let inputElement = document.getElementById("entities");

    let typeahead = new Bloodhound({
        datumTokenizer: Bloodhound.tokenizers.whitespace,
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        remote: {
            url: "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&origin=*&search=%QUERY",
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
        } else {
            if (dropdown) dropdown.style.display = "block";
        }

        fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&origin=*&search=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                let suggestions = data.search.map(item => ({
                    id: item.id,
                    value: item.label,
                    description: item.description || "No description available.",
                    url: item.url
                }));
                displaySuggestions(suggestions);
            })
            .catch(error => console.error("Error fetching data:", error));
    });

    function displaySuggestions(suggestions) {
        let dropdown = document.getElementById("suggestions-dropdown");
        if (!dropdown) {
            dropdown = document.createElement("div");
            dropdown.id = "suggestions-dropdown";
            dropdown.style.position = "sticky";     // absolute
            dropdown.style.background = "white";
            dropdown.style.border = "1px solid #ccc";
            dropdown.style.width = "100%";// inputElement.offsetWidth + "px";
            dropdown.style.maxHeight = "200px";
            dropdown.style.overflowY = "auto";
            dropdown.style.zIndex = "1000";
            /*dropdown.style.left = inputElement.offsetLeft + "px";
            dropdown.style.top = (inputElement.offsetTop + inputElement.offsetHeight) + "px";*/
            inputElement.parentNode.insertBefore(dropdown, document.getElementById('selected-items'));
        }
        dropdown.innerHTML = "";
        suggestions.forEach(item => {
            let div = document.createElement("div");
            div.innerHTML = `<strong>${item.value}</strong> (${item.id})<br><small>${item.description}</small>`;
            div.style.padding = "8px";
            div.style.cursor = "pointer";
            div.style.borderBottom = "1px solid #ddd";
            div.addEventListener("mouseenter", function () {
                div.style.background = "#f0f0f0";
            });
            div.addEventListener("mouseleave", function () {
                div.style.background = "white";
            });
            div.addEventListener("click", async function () {
                await addSelectedItem(item);
                dropdown.innerHTML = "";
                inputElement.value = "";
                dropdown.style.display = "none";
            });
            dropdown.appendChild(div);
        });
    }

    // implement complete entity information
    function addSelectedItem(item) {

        // add loading icon
        const entityLoaderDiv = document.createElement('div');
        entityLoaderDiv.setAttribute('id', 'entity-loader-div');
        const entityLoader = document.createElement('div');
        entityLoader.setAttribute('id', 'entity-loader');
        const selectedItemsContainer = document.getElementById("selected-items");
        selectedItemsContainer.appendChild(entityLoaderDiv);
        entityLoaderDiv.appendChild(entityLoader);

        sparqlRequest(item, true, undefined).then(result => {
            console.log("Entity: ", result);

            addEntity(result, item.value, typeFromArray(result.type), result._id, entityLoaderDiv);

            // add entity to global variables
            const position = document.getElementById('old-position').textContent;
            // get type and role
            const type = typeFromArray(result.type);
            let newEntityMap;
            if (type === 'person') {
                let role;
                if ('occupation' in result) role = result.occupation;
                else if ('position' in result) role = result.position;
                // TODO - fix roles
                newEntityMap = new Map([
                    [result._id, {
                    role: role,
                    class: type,
                    title: result.enName,
                    }]
                ]);
            } else {
                newEntityMap = new Map([
                    [result._id, {
                        class: type,
                        title: result.enName,
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
                // otherwise simply insert the new entity
                props_temp = newEntityMap;
            }
            //if (!result._id in event_entities) event_entities[result._id] = result;

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

                    // if sparql query does a result...
                    if (data["results"]["bindings"] !== "") {

                        data = data["results"]["bindings"];

                        let newItemsToLoad;

                        for (let i=0; i<data.length; i++) {
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

                }).fail(function(e){

                    showModal(
                        "Entity not found",
                        "There is an error with this wikidata entity. Please search another entity and report this error to <a href='mailto:claudio.demartino@isti.cnr.it?subject=AR%20Entity_Error_" + item.id + "'>claudio.demartino@isti.cnr.it</a>",
                        "Back",
                        "OK",
                        function() {
                        },
                        function() {
                        }
                    );

                    console.error("Error:", e);
                    reject(e);

                });

        });
    }

    function sparqlToItem(item, force) {
        let qid = item["uri"]["value"].split("entity/")[1];
        let newItem = {};

        newItem._id = qid;
        newItem._rev = undefined;
        newItem.itName = "";
        newItem.enName = "";
        newItem.itDesc = "";
        newItem.enDesc = "";
        newItem.image = "";
        newItem.type = [];
        newItem.role = [];

        // Extract basic data from each entity
        if ("itName" in item) newItem["itName"] = item["itName"]["value"];
        if ("enName" in item) newItem["enName"] = item["enName"]["value"];
        if ("itDesc" in item) newItem["itDesc"] = item["itDesc"]["value"];
        if ("enDesc" in item) newItem["enDesc"] = item["enDesc"]["value"];
        if ("image" in item) newItem["image"] = item["image"]["value"];
        if ("coordinatesPoint" in item) newItem["coordinatesPoint"] = item["coordinatesPoint"]["value"];
        if ("birth" in item) newItem["birth"] = item["birth"]["value"].replace("+", "").split("T")[0].split("-01-01")[0];
        if ("death" in item) newItem["death"] = item["death"]["value"].replace("+", "").split("T")[0].split("-01-01")[0];
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
            "SELECT DISTINCT ?uri ?type ?itName ?enName ?itDesc ?enDesc ?image " +
            "?birth ?death ?foundation ?foundation2 ?completion ?occupation ?position ?coordinatesPoint" +
            "\nWHERE {\n" +
            "VALUES ?uri {wd:" + qids.join(" wd:") + "}\n" +
            (force ? "" : types) +
            (force ? "OPTIONAL {?uri wdt:P31 ?class.\n}" : "?uri wdt:P31 ?class.\n") +
            (force ? "OPTIONAL {?class wdt:P279* ?type.\n " + types + "}" : "?class wdt:P279* ?type.\n") +
            "OPTIONAL { ?uri wdt:P18 ?image. }\n" +
            "OPTIONAL { ?uri wdt:P569 ?birth. }\n" +
            "OPTIONAL { ?uri wdt:P570 ?death. }\n" +
            "OPTIONAL { ?uri wdt:P571 ?foundation. }\n" +
            "OPTIONAL { ?uri wdt:P580 ?foundation2. }\n" +
            "OPTIONAL { ?uri wdt:P1619 ?completion. }\n" +
            "OPTIONAL { ?uri wdt:P106 ?occupation. }\n" +
            "OPTIONAL { ?uri wdt:P39 ?position. }\n" +
            "OPTIONAL { ?uri wdt:P625 ?coordinatesPoint. }\n" +
            "OPTIONAL { ?uri rdfs:label ?itName filter (lang(?itName) = 'it'). }\n" +
            "OPTIONAL { ?uri rdfs:label ?enName filter (lang(?enName) = 'en'). }\n" +
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

}
