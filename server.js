const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Создание папки для загрузок
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// ========== БАЗА ДАННЫХ ==========
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    // Пользователи
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        full_name TEXT,
        google_id TEXT UNIQUE,
        role TEXT DEFAULT 'user',
        reset_token TEXT,
        reset_expires INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Документы
    db.run(`CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        filename TEXT,
        original_name TEXT,
        file_path TEXT,
        file_type TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Сессии/логи
    db.run(`CREATE TABLE IF NOT EXISTS user_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT,
        ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Добавляем админа по умолчанию (пароль: admin123)
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (email, password, full_name, role) VALUES (?, ?, ?, ?)`,
        ['admin@pedid.ru', adminPassword, 'Администратор', 'admin']
    );
});

// ========== МИДЛВЭРЫ ==========
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(403).json({ error: 'Недействительный токен' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
    next();
};

// Настройка multer для загрузки документов
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ========== GOOGLE AUTH ==========
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    db.get('SELECT * FROM users WHERE google_id = ?', [profile.id], async (err, user) => {
        if (user) return done(null, user);
        const newUser = {
            google_id: profile.id,
            email: profile.emails[0].value,
            full_name: profile.displayName,
            role: 'user'
        };
        db.run('INSERT INTO users (google_id, email, full_name, role) VALUES (?, ?, ?, ?)',
            [newUser.google_id, newUser.email, newUser.full_name, newUser.role],
            function(err) {
                if (err) return done(err);
                newUser.id = this.lastID;
                done(null, newUser);
            });
    });
}));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));
app.use(passport.initialize());

// ========== API МАРШРУТЫ ==========

// Регистрация
app.post('/api/register', async (req, res) => {
    const { email, password, full_name } = req.body;
    if (!email || !password || !full_name) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (email, password, full_name) VALUES (?, ?, ?)',
        [email, hashedPassword, full_name],
        function(err) {
            if (err && err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Пользователь уже существует' });
            }
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            res.json({ success: true, message: 'Регистрация успешна' });
        });
});

// Вход
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Неверный email или пароль' });
        if (user.password && !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ success: true, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
    });
});

// Выход
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// Смена пароля (с подтверждением старого)
app.post('/api/change-password', authenticateToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
        if (!bcrypt.compareSync(oldPassword, user.password)) {
            return res.status(401).json({ error: 'Неверный текущий пароль' });
        }
        const hashed = bcrypt.hashSync(newPassword, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
        res.json({ success: true, message: 'Пароль изменён' });
    });
});

// Восстановление пароля (генерация токена)
app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (!user) return res.json({ success: true, message: 'Если email существует, инструкция отправлена' });
        const token = Math.random().toString(36).substring(2, 15);
        const expires = Date.now() + 3600000; // 1 час
        db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id]);
        // В реальном проекте отправляем email, сейчас просто возвращаем токен для демо
        res.json({ success: true, resetToken: token, message: 'Токен для сброса пароля (демо): ' + token });
    });
});

// Сброс пароля по токену
app.post('/api/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    db.get('SELECT * FROM users WHERE reset_token = ? AND reset_expires > ?', [token, Date.now()], (err, user) => {
        if (!user) return res.status(400).json({ error: 'Недействительный или истёкший токен' });
        const hashed = bcrypt.hashSync(newPassword, 10);
        db.run('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hashed, user.id]);
        res.json({ success: true, message: 'Пароль успешно сброшен' });
    });
});

// Загрузка документа
app.post('/api/upload-document', authenticateToken, upload.single('document'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    db.run(`INSERT INTO documents (user_id, filename, original_name, file_path, file_type) VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, req.file.filename, req.file.originalname, req.file.path, req.file.mimetype],
        function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка сохранения' });
            res.json({ success: true, documentId: this.lastID, filename: req.file.filename });
        });
});

// Получить документы пользователя
app.get('/api/my-documents', authenticateToken, (req, res) => {
    db.all('SELECT * FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC', [req.user.id], (err, docs) => {
        res.json(docs || []);
    });
});

// Скачать документ
app.get('/api/download-document/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM documents WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, doc) => {
        if (!doc) return res.status(404).json({ error: 'Документ не найден' });
        res.download(doc.file_path, doc.original_name);
    });
});

// Удалить документ
app.delete('/api/delete-document/:id', authenticateToken, (req, res) => {
    db.get('SELECT * FROM documents WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, doc) => {
        if (!doc) return res.status(404).json({ error: 'Документ не найден' });
        fs.unlink(doc.file_path, () => {});
        db.run('DELETE FROM documents WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    });
});

// ========== АДМИН-ПАНЕЛЬ ==========
// Получить всех пользователей (только для админа)
app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    db.all('SELECT id, email, full_name, role, created_at FROM users', (err, users) => {
        res.json(users);
    });
});

// Изменить роль пользователя
app.put('/api/admin/users/:id/role', authenticateToken, isAdmin, (req, res) => {
    const { role } = req.body;
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ success: true });
});

// Удалить пользователя
app.delete('/api/admin/users/:id', authenticateToken, isAdmin, (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// Получить все документы (админ)
app.get('/api/admin/documents', authenticateToken, isAdmin, (req, res) => {
    db.all(`SELECT d.*, u.email, u.full_name FROM documents d JOIN users u ON d.user_id = u.id ORDER BY d.uploaded_at DESC`, (err, docs) => {
        res.json(docs);
    });
});

// Статистика
app.get('/api/admin/stats', authenticateToken, isAdmin, (req, res) => {
    db.get('SELECT COUNT(*) as total_users FROM users', (err, usersCount) => {
        db.get('SELECT COUNT(*) as total_documents FROM documents', (err, docsCount) => {
            res.json({ users: usersCount.total_users, documents: docsCount.total_documents });
        });
    });
});

// ========== GOOGLE AUTH ROUTES ==========
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    const token = jwt.sign({ id: req.user.id, email: req.user.email, role: req.user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/');
});

// Получить текущего пользователя
app.get('/api/me', authenticateToken, (req, res) => {
    db.get('SELECT id, email, full_name, role FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: 'Ошибка' });
        res.json(user);
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Админ-панель: войдите как admin@pedid.ru / admin123`);
});
