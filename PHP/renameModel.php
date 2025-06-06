<?php
session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    if (!isset($_SESSION['login_user']) || !isset($_SESSION['id_user'])) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized.']);
        exit();
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'];
    $username = stripslashes($username);
    $username = pg_escape_string($username);

    $oldModelName = basename($input['oldModelName']);
    $newModelName = basename($input['newModelName']);

    $directoryModel = getcwd() . '/3D_models/' . $username . DIRECTORY_SEPARATOR;

    $oldFilePathModel = getcwd() . '/3D_models/' . $username . DIRECTORY_SEPARATOR . $oldModelName . '.zip';
    $newFilePathModel = getcwd() . '/3D_models/' . $username . DIRECTORY_SEPARATOR . $newModelName . '.zip';

    $directoryJson = getcwd() . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'json' . DIRECTORY_SEPARATOR;;
    $oldFilePathJson = getcwd() . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'json' . DIRECTORY_SEPARATOR . $username . DIRECTORY_SEPARATOR . $oldModelName . '.json';
    $newFilePathJson = getcwd() . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'json' . DIRECTORY_SEPARATOR . $username . DIRECTORY_SEPARATOR . $newModelName . '.json';

    if (!is_dir($directoryModel)) {

        echo json_encode(['success' => false, 'message' => 'Directory not found: ' . $directoryModel]);
        exit;

    } else {

        $model_rename = false;
        $json_rename = false;

        // Rename the model
        if (rename($oldFilePathModel, $newFilePathModel)) $model_rename = true;

        // Rename the json if it exists
        if (file_exists($oldFilePathJson)) {

            if ($oldFilePathJson === $newFilePathJson) $json_rename = true;
            else {
                if (copy($oldFilePathJson, $newFilePathJson)) {
                    unlink($oldFilePathJson);
                    $json_rename = true;
                }
            }

        } else $json_rename = true; // if json_dir not exists than there is nothing to check

        $model_rename
            ? $json_rename
                ? $response = ['status' => 'success', 'message' => "Model $newModelName renamed successfully."]
                : $response = ['status' => 'error', 'message' => "Failed to rename $newModelName.json."]
            : $response = ['status' => 'error', 'message' => "Failed to rename $newModelName."];

        echo json_encode($response);
        exit;

    }

} else echo json_encode(['success' => false, 'message' => 'Invalid request.']);