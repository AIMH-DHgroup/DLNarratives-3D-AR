<?php
header('Content-Type: application/json');

$directory = './3D_models/';

$files = scandir($directory);

$glbFiles = array_filter($files, function($file) use ($directory) {
    return (pathinfo($file, PATHINFO_EXTENSION) === 'glb' || pathinfo($file, PATHINFO_EXTENSION) === 'zip') && is_file($directory . $file);
});

echo json_encode(array_values($glbFiles));
?>