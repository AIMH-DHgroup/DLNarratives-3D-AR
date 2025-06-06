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
    $username = $_SESSION['login_user'];
    $username = stripslashes($username);
    $username = pg_escape_string($username);

    $modelName = basename($input['modelName']);

    $directoryModel = './3D_models/' . $username . DIRECTORY_SEPARATOR;
    $filePathModel = './3D_models/' . $username . DIRECTORY_SEPARATOR . $modelName . '.zip';

    $directoryJson = getcwd() . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'json'. DIRECTORY_SEPARATOR . $username . DIRECTORY_SEPARATOR;
    $filePathJson = getcwd() . DIRECTORY_SEPARATOR . '..' . DIRECTORY_SEPARATOR . 'json'. DIRECTORY_SEPARATOR . $username . DIRECTORY_SEPARATOR . $modelName . '.json';

    if (!is_dir($directoryModel)) {

        echo json_encode(['success' => false, 'message' => 'Directory not found.']);
        exit;

    } else {

        $response = [];
        $model_delete = false;
        $json_delete = false;

        // Try to delete the model
        if (file_exists($filePathModel)) {

            $unlinkResult = unlink($filePathModel);
            if ($unlinkResult) $model_delete = true;

        } else $response[] = ['status' => 'error', 'message' => 'File does not exist.'];

        // Try to delete the json
        if (file_exists($filePathJson)) {

            $unlinkResult = unlink($filePathJson);
            if ($unlinkResult) $json_delete = true;

        } else $json_delete = true; // if json_dir not exists than there is nothing to check

        $model_delete
            ? $json_delete
                ? $response = ['status' => 'success', 'message' => "Model $modelName deleted successfully."]
                : $response = ['status' => 'error', 'message' => "Failed to delete $modelName.json."]
            : $response = ['status' => 'error', 'message' => "Failed to delete $modelName."];

        echo json_encode($response);
        exit;

    }

} else echo json_encode(['success' => false, 'message' => 'Invalid request.']);