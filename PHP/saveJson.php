<?php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Decode json
    $input = json_decode(file_get_contents('php://input'), true);

    // Get name and data
    $fileName = $input['fileName'] ?? 'default.json';
    $jsonData = $input['data'] ?? '';

    $fileName = basename($fileName); // Remove unsafe paths

    $filePath = getcwd() . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'json'. DIRECTORY_SEPARATOR . $fileName;

    // Overwrite the file
    if (file_put_contents($filePath, $jsonData)) {
        echo json_encode(["success" => true, "message" => "$fileName file overwritten successfully!"]);
    } else {
        echo json_encode(["success" => false, "message" => "Error saving the file: $fileName."]);
    }
} else {
    echo json_encode(["success" => false, "message" => "Not supported request method."]);
}
?>