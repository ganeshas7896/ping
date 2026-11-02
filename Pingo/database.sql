-- Import in phpMyAdmin (select your database first)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  pass VARCHAR(255) NOT NULL,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS friends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  a INT NOT NULL,                       -- who sent the request
  b INT NOT NULL,                       -- who received it
  status ENUM('pending','accepted') DEFAULT 'pending',
  UNIQUE KEY pair (a,b),
  FOREIGN KEY (a) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (b) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blocks (
  blocker INT NOT NULL,
  blocked INT NOT NULL,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker, blocked),
  FOREIGN KEY (blocker) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender INT NOT NULL,
  receiver INT NOT NULL,
  type ENUM('text','voice','image') NOT NULL, -- voice notes and images are persisted as message rows
  body TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL, -- chat text or media MIME type
  file VARCHAR(80) NULL,                -- generated filename stored under /uploads; NULL after one-time media is opened
  once TINYINT(1) DEFAULT 0,            -- view-once image or voice message; consumed state is viewed_at
  viewed_at DATETIME NULL,
  read_at DATETIME NULL,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY chat (sender, receiver, id),
  FOREIGN KEY (sender) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE messages
  MODIFY type ENUM('text','voice','image') NOT NULL,
  MODIFY body TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  MODIFY file VARCHAR(80) NULL,
  MODIFY once TINYINT(1) NOT NULL DEFAULT 0;
