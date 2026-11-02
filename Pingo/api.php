<?php
require __DIR__ . '/config.php';
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();
header('Content-Type: application/json');
mysqli_report(MYSQLI_REPORT_OFF);
$db = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($db->connect_errno) out(['error' => 'Database connection failed'], 500);
$db->set_charset('utf8mb4');
if (!$db->query("CREATE TABLE IF NOT EXISTS blocks (
  blocker INT NOT NULL,
  blocked INT NOT NULL,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker, blocked),
  FOREIGN KEY (blocker) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")) out(['error' => 'Could not initialize block list'], 500);

$in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$act = $_GET['a'] ?? '';
$me = (int)($_SESSION['uid'] ?? 0);

function out($d, $c = 200) { http_response_code($c); echo json_encode($d); exit; }
function need() { global $me; if (!$me) out(['error' => 'Sign in required'], 401); }
function q($sql, $t = '', ...$p) {
  global $db;
  $s = $db->prepare($sql);
  if (!$s) out(['error' => 'Query error'], 500);
  if ($t) $s->bind_param($t, ...$p);
  $s->execute();
  $r = $s->get_result();
  return $r ? $r->fetch_all(MYSQLI_ASSOC) : $s->insert_id;
}
function upload_destination($name) {
  $dir = rtrim(UPLOAD_DIR, '/\\') . DIRECTORY_SEPARATOR;
  if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
    error_log('[Ping] Upload directory could not be created.');
    out(['error' => 'Media storage is unavailable. Create the uploads folder and allow PHP to write to it.'], 500);
  }
  if (!is_writable($dir)) @chmod($dir, 0755);
  if (!is_writable($dir)) {
    error_log('[Ping] Upload directory is not writable by PHP.');
    out(['error' => 'PHP cannot write to media storage. Make the uploads folder writable by the web server, then try again.'], 500);
  }
  return $dir . basename($name);
}
function login($id) { session_regenerate_id(true); $_SESSION['uid'] = (int)$id; out(['ok' => 1]); }
function friend($w) {
  global $me;
  if (!q("SELECT id FROM friends WHERE status='accepted' AND ((a=? AND b=?) OR (a=? AND b=?))
         AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?))",
         'iiiiiiii', $me, $w, $w, $me, $me, $w, $w, $me))
    out(['error' => 'Not friends yet'], 403);
}

switch ($act) {
  case 'cfg':
    out(['google' => GOOGLE_CLIENT_ID]);

  case 'signup':
    $un = strtolower(trim($in['username'] ?? ''));
    $em = strtolower(trim($in['email'] ?? ''));
    $pw = $in['password'] ?? '';
    if (!preg_match('/^[a-z0-9_]{3,20}$/', $un)) out(['error' => 'Username: 3–20 letters, numbers or _'], 400);
    if (!filter_var($em, FILTER_VALIDATE_EMAIL)) out(['error' => 'Enter a valid email'], 400);
    if (!is_string($pw) || !preg_match('/^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s]).{8,}$/s', $pw))
      out(['error' => 'Password must be at least 8 characters and include a letter, a number, and a special character'], 400);
    if (q('SELECT id FROM users WHERE username=? OR email=?', 'ss', $un, $em)) out(['error' => 'Username or email already taken'], 409);
    login(q('INSERT INTO users(username,email,pass) VALUES(?,?,?)', 'sss', $un, $em, password_hash($pw, PASSWORD_DEFAULT)));

  case 'login':
    $id = strtolower(trim($in['id'] ?? ''));
    $u = q('SELECT id,pass FROM users WHERE username=? OR email=?', 'ss', $id, $id);
    if (!$u || !password_verify($in['password'] ?? '', $u[0]['pass'])) out(['error' => 'Wrong username/email or password'], 401);
    login($u[0]['id']);

  case 'google':
    if (GOOGLE_CLIENT_ID === '') out(['error' => 'Google sign-in is not enabled'], 400);
    $t = urlencode($in['credential'] ?? '');
    $j = json_decode(@file_get_contents("https://oauth2.googleapis.com/tokeninfo?id_token=$t"), true);
    if (!$j || ($j['aud'] ?? '') !== GOOGLE_CLIENT_ID || ($j['email_verified'] ?? '') !== 'true') out(['error' => 'Google sign-in failed'], 401);
    $em = strtolower($j['email']);
    $u = q('SELECT id FROM users WHERE email=?', 's', $em);
    if ($u) login($u[0]['id']);
    $base = substr(preg_replace('/[^a-z0-9_]/', '', strstr($em, '@', true)), 0, 14) ?: 'user';
    login(q('INSERT INTO users(username,email,pass) VALUES(?,?,?)', 'sss', $base . rand(100, 999), $em, ''));

  case 'logout':
    session_destroy(); out(['ok' => 1]);

  case 'sync':
    need();
    $u = q('SELECT id,username FROM users WHERE id=?', 'i', $me);
    if (!$u) { session_destroy(); out(['error' => 'Sign in required'], 401); }
    $fr = q("SELECT u.id,u.username,(SELECT COUNT(*) FROM messages m WHERE m.sender=u.id AND m.receiver=? AND m.read_at IS NULL) unread
             FROM friends f JOIN users u ON u.id=IF(f.a=?,f.b,f.a)
             WHERE (f.a=? OR f.b=?) AND f.status='accepted'
             AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker=? AND blocked=u.id) OR (blocker=u.id AND blocked=?))
             ORDER BY u.username", 'iiiiii', $me, $me, $me, $me, $me, $me);
    $rq = q("SELECT f.id,u.username FROM friends f JOIN users u ON u.id=f.a
             WHERE f.b=? AND f.status='pending'
             AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker=? AND blocked=u.id) OR (blocker=u.id AND blocked=?))", 'iii', $me, $me, $me);
    $bl = q('SELECT u.id,u.username FROM blocks b JOIN users u ON u.id=b.blocked WHERE b.blocker=? ORDER BY u.username', 'i', $me);
    out(['me' => $u[0], 'friends' => $fr, 'requests' => $rq, 'blocked' => $bl]);

  case 'request':
    need();
    $un = strtolower(trim(ltrim($in['username'] ?? '', '@')));
    $u = q('SELECT id FROM users WHERE username=?', 's', $un);
    if (!$u) out(['error' => 'No one has that username'], 404);
    $t = (int)$u[0]['id'];
    if ($t === $me) out(['error' => "That's your own username"], 400);
    if (q('SELECT blocker FROM blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)', 'iiii', $me, $t, $t, $me))
      out(['error' => 'This user cannot receive a friend request'], 403);
    $e = q('SELECT a,status FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)', 'iiii', $me, $t, $t, $me);
    if ($e) {
      if ($e[0]['status'] === 'pending' && (int)$e[0]['a'] === $t) {
        q("UPDATE friends SET status='accepted' WHERE a=? AND b=?", 'ii', $t, $me);
        out(['ok' => 1, 'msg' => "You're now friends with @$un"]);
      }
      out(['error' => $e[0]['status'] === 'accepted' ? 'Already friends' : 'Request already sent'], 409);
    }
    q('INSERT INTO friends(a,b) VALUES(?,?)', 'ii', $me, $t);
    out(['ok' => 1, 'msg' => "Request sent to @$un"]);

  case 'respond':
    need();
    $id = (int)($in['id'] ?? 0);
    if (!empty($in['accept'])) {
      $req = q("SELECT a FROM friends WHERE id=? AND b=? AND status='pending'", 'ii', $id, $me);
      if ($req && q('SELECT blocker FROM blocks WHERE (blocker=? AND blocked=?) OR (blocker=? AND blocked=?)', 'iiii', $me, (int)$req[0]['a'], (int)$req[0]['a'], $me))
        out(['error' => 'This request is unavailable'], 403);
      q("UPDATE friends SET status='accepted' WHERE id=? AND b=? AND status='pending'", 'ii', $id, $me);
    }
    else q("DELETE FROM friends WHERE id=? AND b=? AND status='pending'", 'ii', $id, $me);
    out(['ok' => 1]);

  case 'block':
    need();
    $t = (int)($in['id'] ?? 0);
    if ($t === $me) out(['error' => 'You cannot block yourself'], 400);
    if (!q('SELECT id FROM users WHERE id=?', 'i', $t)) out(['error' => 'User not found'], 404);
    q('INSERT IGNORE INTO blocks(blocker,blocked) VALUES(?,?)', 'ii', $me, $t);
    q('DELETE FROM friends WHERE (a=? AND b=?) OR (a=? AND b=?)', 'iiii', $me, $t, $t, $me);
    out(['ok' => 1]);

  case 'unblock':
    need();
    $t = (int)($in['id'] ?? 0);
    q('DELETE FROM blocks WHERE blocker=? AND blocked=?', 'ii', $me, $t);
    out(['ok' => 1]);

  case 'msgs':
    need();
    $w = (int)($_GET['with'] ?? 0); friend($w);
    $af = (int)($_GET['after'] ?? 0);
    q('UPDATE messages SET read_at=NOW() WHERE sender=? AND receiver=? AND read_at IS NULL', 'ii', $w, $me);
    $m = q("SELECT id,(sender=?) mine,type,once,IF(type='text',body,'') body,(viewed_at IS NOT NULL) viewed,UNIX_TIMESTAMP(created) ts
            FROM messages WHERE id>? AND ((sender=? AND receiver=?) OR (sender=? AND receiver=?)) ORDER BY id LIMIT 200",
           'iiiiii', $me, $af, $me, $w, $w, $me);
    $o = q('SELECT id FROM messages WHERE sender=? AND receiver=? AND once=1 AND viewed_at IS NOT NULL', 'ii', $me, $w);
    out(['msgs' => $m, 'opened' => array_column($o, 'id')]);

  case 'send':
    need();
    $w = (int)($in['with'] ?? 0); friend($w);
    $b = trim($in['body'] ?? '');
    if ($b === '' || mb_strlen($b) > 2000) out(['error' => 'Message must be 1–2000 characters'], 400);
    q("INSERT INTO messages(sender,receiver,type,body) VALUES(?,?,'text',?)", 'iis', $me, $w, $b);
    out(['ok' => 1]);

  case 'upload':
    need();
    if (empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0)
      out(['error' => 'Upload exceeds the server request-size limit. Try a smaller image or audio clip.'], 413);
    $w = (int)($in['with'] ?? 0); friend($w);
    $f = $_FILES['file'] ?? null;
    if (!$f) out(['error' => 'No file received. Please choose the image or record again.'], 400);
    if ($f['error'] !== UPLOAD_ERR_OK) {
      $errors = [
        UPLOAD_ERR_INI_SIZE => 'File exceeds the server upload limit. Try a smaller file.',
        UPLOAD_ERR_FORM_SIZE => 'File exceeds the upload limit. Try a smaller file.',
        UPLOAD_ERR_PARTIAL => 'Upload was interrupted. Please try again.',
        UPLOAD_ERR_NO_FILE => 'No file received. Please choose the image or record again.',
        UPLOAD_ERR_NO_TMP_DIR => 'Server upload storage is unavailable.',
        UPLOAD_ERR_CANT_WRITE => 'Server could not save the upload.',
        UPLOAD_ERR_EXTENSION => 'Server rejected the upload.'
      ];
      out(['error' => $errors[$f['error']] ?? 'Upload failed. Please try again.'], 400);
    }
    if (!is_uploaded_file($f['tmp_name']) || !is_file($f['tmp_name']) || $f['size'] < 1)
      out(['error' => 'Uploaded file is empty or invalid'], 400);
    if ($f['size'] > MAX_UPLOAD) out(['error' => 'File exceeds ' . number_format(MAX_UPLOAD / 1048576, 1) . ' MB'], 400);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!$mime) out(['error' => 'Could not identify the uploaded file type'], 400);
    $kind = ($in['kind'] ?? '') === 'image' ? 'image' : 'voice';
    if ($kind === 'image') {
      $ok = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
      $image = @getimagesize($f['tmp_name']);
      if (!$image || !isset($ok[$image['mime']]) || $image['mime'] !== $mime)
        out(['error' => 'Unsupported image. Choose a JPEG, PNG, GIF, or WebP image.'], 415);
    } else {
      $ok = ['audio/webm' => 'webm', 'video/webm' => 'webm', 'audio/ogg' => 'ogg', 'application/ogg' => 'ogg',
             'audio/mp4' => 'm4a', 'video/mp4' => 'm4a', 'audio/x-m4a' => 'm4a',
             'audio/mpeg' => 'mp3', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav',
             'audio/aac' => 'aac', 'audio/3gpp' => '3gp'];
      if ($mime === 'video/webm') $mime = 'audio/webm';
      if ($mime === 'video/mp4') $mime = 'audio/mp4';
      if ($mime === 'application/ogg') $mime = 'audio/ogg';
      if ($mime === 'audio/x-wav') $mime = 'audio/wav';
    }
    if (!isset($ok[$mime])) out(['error' => 'Unsupported file type'], 400);
    $name = bin2hex(random_bytes(16)) . '.' . $ok[$mime];
    $destination = upload_destination($name);
    if (!@move_uploaded_file($f['tmp_name'], $destination) && !@copy($f['tmp_name'], $destination)) {
      error_log('[Ping] Uploaded media could not be moved into storage.');
      out(['error' => 'The server received your file but could not save it. Check uploads folder permissions and available disk space.'], 500);
    }
    $once = in_array($kind, ['image', 'voice'], true) && !empty($in['once']) ? 1 : 0;
    $stmt = $db->prepare('INSERT INTO messages(sender,receiver,type,body,file,once) VALUES(?,?,?,?,?,?)');
    if (!$stmt) {
      @unlink($destination);
      error_log('[Ping] Could not prepare media metadata insert.');
      out(['error' => 'Could not save media details to the database. Please try again.'], 500);
    }
    $stmt->bind_param('iisssi', $me, $w, $kind, $mime, $name, $once);
    if (!$stmt->execute()) {
      $stmt->close();
      @unlink($destination);
      error_log('[Ping] Could not save media metadata to the database.');
      out(['error' => 'Could not save media details to the database. Please try again.'], 500);
    }
    $messageId = $stmt->insert_id;
    $stmt->close();
    out(['ok' => 1, 'id' => $messageId, 'type' => $kind]);

  case 'media':
    need();
    $id = (int)($_GET['id'] ?? 0);
    $r = q('SELECT * FROM messages WHERE id=? AND file IS NOT NULL AND (sender=? OR receiver=?)', 'iii', $id, $me, $me);
    if (!$r) out(['error' => 'This media is gone'], 404);
    $m = $r[0];
    $other = (int)$m['sender'] === $me ? (int)$m['receiver'] : (int)$m['sender'];
    friend($other);
    $p = UPLOAD_DIR . basename($m['file']);
    if (!is_file($p)) out(['error' => 'This media is gone'], 404);
    if ($m['once']) {
      if ((int)$m['receiver'] !== $me) out(['error' => 'Only the receiver can open this'], 403);
      $db->query("UPDATE messages SET viewed_at=NOW(), file=NULL WHERE id=$id AND viewed_at IS NULL");
      if ($db->affected_rows < 1) out(['error' => 'Already opened'], 410);
    }
    header('Content-Type: ' . $m['body']);
    header('Content-Length: ' . filesize($p));
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($p);
    if ($m['once']) unlink($p);
    exit;

  default:
    out(['error' => 'Unknown action'], 404);
}
