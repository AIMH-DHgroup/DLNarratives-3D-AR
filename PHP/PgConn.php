<?php
session_start();

if(isset($_SESSION['Demon_on'])){

    require('../../../../try/PgConnDemo.php');

} else {

    require('../../../../try/PgConn.php');

}