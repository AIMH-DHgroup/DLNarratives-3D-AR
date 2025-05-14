<?php
session_start();
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'];
    $password = $input['password'];

    // DB POSTGRES
    require('PgConn.php');

    // delete sessiondemo to be able to connect to real database
    if(isset($_SESSION['Demon_on'])){
        session_destroy ();
    }

    $error = '';

	if (empty($username) || empty($password)) {
	    $error = "Username or Password is invalid";
        echo json_encode(["success" => false, "error" => $error]);
        exit;
	} else {

        // MySQL injection protection
        $usernameAdm = stripslashes($username);
        $passwordAdm = stripslashes($password);
        $usernameAdm = pg_escape_string($usernameAdm);
        $passwordAdm = pg_escape_string($passwordAdm);
        $passwordAdm = md5($passwordAdm);

        // Selecting Database
        $query = "select * from users where password = '".$passwordAdm."' AND username = '".$usernameAdm."'";
        $result = pg_query($query) or die('Error message: ' . pg_last_error());
        while ($row = pg_fetch_row($result)) {
            $idUser = $row[0];
        }
        $numrows = pg_num_rows($result);

        $arr = [];
        if ($numrows === 1) {

            // username for table name
            $_SESSION['login_user'] = str_replace("-","",$usernameAdm) . "." . $idUser;

            // username to display (it is equals to usernames for our users; is different for vre users)
            $_SESSION['username_to_display'] = str_replace("-","",$usernameAdm) . "." . $idUser;

            // id of user
            $_SESSION['id_user'] = $idUser;

            // variable if is vre user
            $_SESSION['VRE_user'] = 0;

            // get all narrations of this user
            $query = "select id, title, subject, copied_from from narrations where \"user\"= '".$_SESSION['id_user']."' order by id desc";
            $result = pg_query($query) or die('Error message: ' . pg_last_error());

            while ($row = pg_fetch_row($result)) {
                array_push($arr, $row);
            }

            pg_free_result($result);

        } else {
            $error = "Username or Password is invalid";
            echo json_encode(["success" => false, "error" => $error]);
            exit;
        }

        pg_close($dbconn); // Closing Connection - $dbconn is from require()
	}

    // delete old session id to avoid conflicts
    session_regenerate_id(true);

    // array json
    $arrayJson = array("success" => true, "jsonData" => $arr, "usernameToDisplay" => $_SESSION['username_to_display'], "username" => $_SESSION['login_user'], "idUser" => $_SESSION['id_user']);
    echo json_encode($arrayJson);

} else {
    echo json_encode(['success' => false, 'message' => 'Invalid request']);
}