<?php
// ===== PING CONFIG — edit these for your host =====
define('DB_HOST', 'sql302.infinityfree.com');
define('DB_NAME', 'if0_43267473_ping');
define('DB_USER', 'if0_43267473');
define('DB_PASS', 'pingo1234567890');

// Optional: "Sign in with Google". Create an OAuth Web Client ID at
// console.cloud.google.com and add your site URL under Authorized JavaScript origins.
// Leave '' to disable (manual email + password still works).
define('GOOGLE_CLIENT_ID', '');

define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('MAX_UPLOAD', 8 * 1024 * 1024); // 8 MB

date_default_timezone_set('UTC');
ini_set('display_errors', '0');
