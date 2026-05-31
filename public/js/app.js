// ========== ХРАНИЛИЩЕ ДАННЫХ (localStorage) ==========
let currentUser = null;

function getUsers() {
    const users = localStorage.getItem('pedid_users');
    return users ? JSON.parse(users) : [];
}

function saveUsers(users) {
    localStorage.setItem('pedid_users', JSON.stringify(users));
}

function getCurrentSession() {
    const session = localStorage.getItem('pedid_current_user');
    return session ? JSON.parse(session) : null;
}

function setCurrentSession(user) {
    localStorage.setItem('pedid_current_user', JSON.stringify(user));
    currentUser = user;
}

function clearSession() {
    localStorage.removeItem('pedid_current_user');
    currentUser = null;
}

// Документы пользователя
function getUserDocuments(userId) {
    const docs = localStorage.getItem(`pedid_docs_${userId}`);
    return docs ? JSON.parse(docs) : [];
}

function saveUserDocument(userId, doc) {
    const docs = getUserDocuments(userId);
    docs.push({ ...doc, id: Date.now(), uploadedAt: new Date().toISOString() });
    localStorage.setItem(`pedid_docs_${userId}`, JSON.stringify(docs));
}

function deleteUserDocument(userId, docId) {
    let docs = getUserDocuments(userId);
    docs = docs.filter(d => d.id != docId);
    localStorage.setItem(`pedid_docs_${userId}`, JSON.stringify(docs));
}

// Регистрация
function register(email, password, fullName) {
    const users = getUsers();
    if (users.find(u => u.email === email)) {
        return { success: false, error: "Такой пользователь уже существует" };
    }
    const newUser = {
        id: Date.now(),
        email,
        password,
        fullName,
        role: 'user',
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);
    return { success: true };
}

// Вход
function login(email, password) {
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        setCurrentSession({ id: user.id, email: user.email, fullName: user.fullName, role: user.role });
        return { success: true };
    }
    return { success: false, error: "Неверный email или пароль" };
}

// Смена пароля
function changePassword(userId, oldPassword, newPassword) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) return { success: false, error: "Пользователь не найден" };
    if (users[userIndex].password !== oldPassword) return { success: false, error: "Неверный текущий пароль" };
    users[userIndex].password = newPassword;
    saveUsers(users);
    return { success: true, message: "Пароль успешно изменён" };
}

// ========== ОТРИСОВКА ==========
function renderAuth() {
    document.getElementById('app').innerHTML = `
        <div class="auth-container">
            <div class="auth-card">
                <div class="auth-logo"><span>Пед.</span><span>ID</span></div>
                <div class="tabs">
                    <button class="tab-btn active" data-tab="login">Вход</button>
                    <button class="tab-btn" data-tab="register">Регистрация</button>
                </div>
                <div id="loginForm" class="form active-form">
                    <div class="input-group"><label>📧 Email</label><input type="email" id="loginEmail" placeholder="teacher@example.com"></div>
                    <div class="input-group"><label>🔒 Пароль</label><input type="password" id="loginPassword" placeholder="••••••••"></div>
                    <button id="doLoginBtn">Войти</button>
                    <button class="google-btn" id="googleLoginBtn">Войти через Google (демо)</button>
                    <div style="text-align:center; margin-top:8px;"><a href="#" id="forgotPasswordLink" style="color:#FFB347;">Забыли пароль?</a></div>
                    <div id="loginMessage" class="message"></div>
                </div>
                <div id="registerForm" class="form">
                    <div class="input-group"><label>👤 Полное имя</label><input type="text" id="regName" placeholder="Иванова Анна Петровна"></div>
                    <div class="input-group"><label>📧 Email</label><input type="email" id="regEmail" placeholder="teacher@pedid.ru"></div>
                    <div class="input-group"><label>🔑 Пароль (мин. 6 символов)</label><input type="password" id="regPassword"></div>
                    <div class="checkbox-group"><input type="checkbox" id="agreeData"> <label>Я согласен на обработку персональных данных</label></div>
                    <button id="doRegisterBtn">Зарегистрироваться</button>
                    <div id="regMessage" class="message"></div>
                </div>
            </div>
        </div>
    `;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('loginForm').classList.toggle('active-form', tab === 'login');
            document.getElementById('registerForm').classList.toggle('active-form', tab === 'register');
        });
    });

    document.getElementById('doLoginBtn').addEventListener('click', () => {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const msgDiv = document.getElementById('loginMessage');
        const res = login(email, password);
        if (res.success) {
            msgDiv.className = 'message success-message';
            msgDiv.innerText = 'Вход выполнен!';
            setTimeout(() => renderDashboard(), 1000);
        } else {
            msgDiv.className = 'message error-message';
            msgDiv.innerText = res.error;
        }
    });

    document.getElementById('googleLoginBtn').addEventListener('click', () => {
        alert('Демо-режим: войдите как test@pedid.ru / 123456');
    });

    document.getElementById('doRegisterBtn').addEventListener('click', () => {
        const fullName = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        const agree = document.getElementById('agreeData').checked;
        const msgDiv = document.getElementById('regMessage');
        if (!fullName || !email || !password) {
            msgDiv.className = 'message error-message';
            msgDiv.innerText = 'Заполните все поля';
            return;
        }
        if (password.length < 6) {
            msgDiv.className = 'message error-message';
            msgDiv.innerText = 'Пароль минимум 6 символов';
            return;
        }
        if (!agree) {
            msgDiv.className = 'message error-message';
            msgDiv.innerText = 'Согласие на обработку данных обязательно';
            return;
        }
        const res = register(email, password, fullName);
        if (res.success) {
            msgDiv.className = 'message success-message';
            msgDiv.innerText = 'Регистрация успешна! Теперь войдите.';
            document.querySelector('.tab-btn[data-tab="login"]').click();
            document.getElementById('loginEmail').value = email;
        } else {
            msgDiv.className = 'message error-message';
            msgDiv.innerText = res.error;
        }
    });

    document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
        e.preventDefault();
        alert('Демо-режим: для восстановления пароля обратитесь к администратору. По умолчанию: test@pedid.ru / 123456');
    });
}

function showChangePasswordModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); justify-content:center; align-items:center; z-index:1000;';
    modal.innerHTML = `
        <div style="background:white; padding:24px; border-radius:24px; max-width:500px; width:90%;">
            <h3>Смена пароля</h3>
            <div class="input-group"><label>Старый пароль</label><input type="password" id="oldPwd"></div>
            <div class="input-group"><label>Новый пароль</label><input type="password" id="newPwd"></div>
            <button id="changePwdBtn">Сменить пароль</button>
            <div id="changePwdMessage" class="message"></div>
            <button id="closePwdModal" style="background:#ccc; margin-top:8px;">Закрыть</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('changePwdBtn').addEventListener('click', () => {
        const oldPassword = document.getElementById('oldPwd').value;
        const newPassword = document.getElementById('newPwd').value;
        const res = changePassword(currentUser.id, oldPassword, newPassword);
        const msgDiv = document.getElementById('changePwdMessage');
        if (res.success) {
            msgDiv.className = 'message success-message';
            msgDiv.innerText = res.message;
            setTimeout(() => modal.remove(), 1500);
        } else {
            msgDiv.className = 'message error-message';
            msgDiv.innerText = res.error;
        }
    });
    document.getElementById('closePwdModal').addEventListener('click', () => modal.remove());
}

function uploadDocument(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const doc = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result,
                uploadedAt: new Date().toISOString()
            };
            saveUserDocument(currentUser.id, doc);
            resolve({ success: true });
        };
        reader.readAsDataURL(file);
    });
}

function renderDashboard() {
    const isAdmin = currentUser.role === 'admin';
    document.getElementById('app').innerHTML = `
        <div>
            <div class="top-bar">
                <div class="logo"><span>Пед.</span><span>ID</span></div>
                <div class="nav-links">
                    <a data-topnav="services">Услуги</a>
                    <a data-topnav="documents">Документы</a>
                    <a data-topnav="payments">Платежи</a>
                    <a data-topnav="help">Помощь</a>
                </div>
                <div class="logout-btn" id="logoutBtn">Выйти</div>
            </div>
            <div class="dashboard">
                <div class="sidebar">
                    <div class="sidebar-item" data-section="account">Учётная запись</div>
                    <div class="sidebar-item" data-section="security">Безопасность</div>
                    <div class="sidebar-item" data-section="myschool">Моя школа</div>
                    <div class="sidebar-item" data-section="docs">Документы</div>
                    <div class="sidebar-item" data-section="vacancies">Вакансии</div>
                    <div class="sidebar-item" data-section="notifications">Уведомления</div>
                    <div class="sidebar-item" data-section="rating">Мой рейтинг</div>
                    <div class="sidebar-item" data-section="labour">Трудовая книжка</div>
                </div>
                <div class="content" id="mainContent">
                    <div id="section-account" class="dynamic-section"></div>
                    <div id="section-security" class="dynamic-section hidden-section"></div>
                    <div id="section-myschool" class="dynamic-section hidden-section"></div>
                    <div id="section-docs" class="dynamic-section hidden-section"></div>
                    <div id="section-vacancies" class="dynamic-section hidden-section"></div>
                    <div id="section-notifications" class="dynamic-section hidden-section"></div>
                    <div id="section-rating" class="dynamic-section hidden-section"></div>
                    <div id="section-labour" class="dynamic-section hidden-section"></div>
                </div>
            </div>
        </div>
    `;

    // Account
    document.getElementById('section-account').innerHTML = `
        <div class="profile-header"><div class="profile-name"><h2>${currentUser.fullName}</h2><p>ID: ${currentUser.id} · ${currentUser.role === 'admin' ? 'Администратор' : 'Педагог'}</p></div></div>
        <div class="info-grid"><div><div class="info-label">📧 Email</div><div>${currentUser.email}</div></div><div><div class="info-label">👤 Роль</div><div>${currentUser.role}</div></div><div><div class="info-label">🏠 Адрес</div><div>Ангарск, ул. Ленина 12 <span class="edit-link">ИЗМЕНИТЬ</span></div></div></div>
        <h3>Доступные услуги</h3>
        <div class="services-block"><div class="service-card"><h4>📄 Справки</h4><p>О портфолио и трудовой книжке</p></div><div class="service-card"><h4>💼 Трудоустройство</h4><p>Заявление на приём</p></div><div class="service-card"><h4>🚪 Увольнение</h4><p>Подать заявление</p></div></div>
    `;

    // Security
    document.getElementById('section-security').innerHTML = `
        <h2>🔐 Безопасность</h2>
        <div class="twofa-panel"><h3>Сменить пароль</h3><button id="changePwdBtn">Сменить пароль</button></div>
        <div class="twofa-panel"><h3>2FA и бот Иннокентий</h3><div class="inline-code">Код: ${currentUser.id}ID213</div><button class="bot-btn">Написать Иннокентию</button></div>
    `;
    document.getElementById('changePwdBtn')?.addEventListener('click', showChangePasswordModal);

    // My school
    document.getElementById('section-myschool').innerHTML = `<h2>🏫 Моя школа</h2><p>ЧОУ «Гимназия №3» · Учитель</p><button>Перейти к ЭлЖур</button>`;

    // Documents
    document.getElementById('section-docs').innerHTML = `
        <h2>📂 Мои документы</h2>
        <input type="file" id="docUpload" accept=".pdf,.doc,.docx,.jpg,.png">
        <button id="uploadDocBtn">Загрузить документ</button>
        <div id="documentsList" class="document-list"></div>
    `;

    function refreshDocs() {
        const docs = getUserDocuments(currentUser.id);
        const listDiv = document.getElementById('documentsList');
        if (listDiv) {
            listDiv.innerHTML = docs.map(doc => `
                <div class="document-item">
                    <span>📄 ${doc.name}</span>
                    <div><button class="delete-doc" data-id="${doc.id}" style="background:#dc2626; padding:4px 12px;">Удалить</button></div>
                </div>
            `).join('');
            document.querySelectorAll('.delete-doc').forEach(btn => {
                btn.addEventListener('click', () => {
                    deleteUserDocument(currentUser.id, parseInt(btn.getAttribute('data-id')));
                    refreshDocs();
                });
            });
        }
    }
    document.getElementById('uploadDocBtn')?.addEventListener('click', async () => {
        const file = document.getElementById('docUpload').files[0];
        if (file) {
            await uploadDocument(file);
            refreshDocs();
        }
    });
    refreshDocs();

    // Vacancies
    document.getElementById('section-vacancies').innerHTML = `<h2>📌 Вакансии (45)</h2><div class="vacancy-list"><div class="vacancy-item">ЧОУ «Гимназия №4» — Учитель <button>Откликнуться</button></div><div class="vacancy-item">ЧОУ «СОШ №33» — Учитель ИЗО <button>Откликнуться</button></div></div>`;

    // Notifications
    document.getElementById('section-notifications').innerHTML = `<h2>🔔 Уведомления</h2><div class="notification-item">✅ Ваше заявление одобрено (17.05.2026)</div><div class="notification-item">📄 Услуга оказана: Выписка данных</div>`;

    // Rating
    document.getElementById('section-rating').innerHTML = `<h2>⭐ Мой рейтинг</h2><div class="vacancy-item">Нет активных мест работы для отображения рейтинга</div>`;

    // Labour
    document.getElementById('section-labour').innerHTML = `<h2>📘 Цифровая трудовая книжка</h2><div class="vacancy-item">17.05.2026 — н.в. · ЧОУ «Гимназия №3», Учитель</div>`;

    // Navigation
    const sections = ['account', 'security', 'myschool', 'docs', 'vacancies', 'notifications', 'rating', 'labour'];
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const dynamicDivs = document.querySelectorAll('.dynamic-section');
    function showSection(sectionId) {
        dynamicDivs.forEach(div => div.classList.add('hidden-section'));
        const target = document.getElementById(`section-${sectionId}`);
        if (target) target.classList.remove('hidden-section');
        sidebarItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-section') === sectionId) item.classList.add('active');
        });
    }
    sidebarItems.forEach(item => {
        item.addEventListener('click', () => showSection(item.getAttribute('data-section')));
    });
    showSection('account');

    document.getElementById('logoutBtn').addEventListener('click', () => {
        clearSession();
        renderAuth();
    });
}

// Запуск
const session = getCurrentSession();
if (session) {
    currentUser = session;
    renderDashboard();
} else {
    renderAuth();
}
