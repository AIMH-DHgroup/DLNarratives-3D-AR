# DLNarratives - 3D and AR version
The application treats 3D models as semantic narratives where each annotation is an event of the narrative. The tool is divided into four main parts: the initial interface, the 3D viewer, the annotation editor and the AR mode. On the first page, once logged in, the user can upload a model or load an existing one. When the user selects a model from the list of saved models, the application loads the 3D viewer that shows the model that the user can navigate and interact with. From the 3D viewer the user can open a new tab to customise the annotations or start the AR mode. Customisation allows the user to create, delete or modify annotations, inserting a title, a description, setting the camera position for each of them, inserting entities that are part of the event and digital objects as additional information and change the order of annotations. The user can also download a JSON file of the entire narrative, compatible with semantic triplifiers. Finally, the AR mode has been tested and is compatible with Android smartphones and tablets and AR devices such as HoloLens or Meta Quest. In this mode, the user can rotate, zoom and move the model, as well as interact with the annotations.

## Technical features
-  ⬆️ Upload local .glb files (max 40 MB each)
-  🌍 3D viewer
-  📷 AR mode
-  📝 Annotation editor
-  💾 Export JSON file
-  💯 Compatibility with SMBVT

## Dependencies
To use the tool, the following software is needed:
- [PostgreSQL](https://www.postgresql.org/)
- If you want to install the system on your machine, you have to install software like XAMPP that provides the Apache web server and the latest versions of PHP.

## Configuration and Installation
After installing PostgreSQL, you must create a database and import the two tables contained in the SQL folder. The config file to update your connection data is PHP/PgConn.php. 

## Help/Feedback
If you need help or want to leave feedback, check out the discussions [here](https://github.com/AIMH-DHgroup/3D-annotation-tool/discussions) or start a new one.
