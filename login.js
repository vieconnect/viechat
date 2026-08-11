import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, GoogleAuthProvider, signInWithPopup, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, query, orderByChild, equalTo, get, set, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAhMEgCE8G0uu9eJn5_RPK9Hkwuk1ARUkA",
    authDomain: "viechat-app.firebaseapp.com",
    databaseURL: "https://viechat-app-default-rtdb.firebaseio.com",
    projectId: "viechat-app",
    storageBucket: "viechat-app.firebasestorage.app",
    messagingSenderId: "925227569457",
    appId: "1:925227569457:web:e8c725f0937c309cf2e010"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentForm = 'login';
let isTransitioning = false;
let foundUserData = null;
let foundUserUid = null;
let isSigningUp = false;
let pendingSocialUser = null;
let pendingSocialProvider = null;
let foundInDeleted = false;
let pendingDeletedUser = null;
let countdownInterval = null;
let isLoading = false;

// ===== SET MOBILE HEIGHT =====
function setMobileHeight() {
    const authScreen = document.getElementById('auth-screen');
    if (!authScreen) return;
    
    if (window.innerWidth <= 520) {
        const vh = window.innerHeight;
        authScreen.style.height = `${vh}px`;
        authScreen.style.minHeight = `${vh}px`;
        authScreen.style.maxHeight = `${vh}px`;
    } else {
        authScreen.style.height = '';
        authScreen.style.minHeight = '';
        authScreen.style.maxHeight = '';
    }
}

// ===== TOAST =====
function showToast(title, message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast-custom toast-${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></div>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.closest('.toast-custom').remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('toast-hide');
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 300);
        }
    }, duration);
}

// ===== CHECK AGE =====
function checkAge(birthday) {
    const now = new Date();
    const birthDate = new Date(birthday);
    let age = now.getFullYear() - birthDate.getFullYear();
    const monthDiff = now.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// ===== HIDE ALL FORMS =====
function hideAllForms() {
    const formIds = ['step-email', 'step-password', 'signup-form', 'forgot-form', 'lock-form', 'deleted-form', 'complete-profile-form'];
    formIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.style.display = 'none';
        }
    });
}

// ===== SHOW FORM =====
function showForm(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = 'block';
        void el.offsetWidth;
        el.classList.add('active');
    }
}

// ===== SHOW/HIDE LOADING ON BUTTON =====
function setLoading(buttonId, isLoadingState, loadingText = 'Đang xử lý...') {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    
    if (isLoadingState) {
        btn.disabled = true;
        btn._originalText = btn.innerHTML;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> ${loadingText}`;
    } else {
        btn.disabled = false;
        if (btn._originalText) {
            btn.innerHTML = btn._originalText;
        }
    }
}

function setAllInputsDisabled(disabled) {
    const inputs = document.querySelectorAll('#auth-screen input, #auth-screen select, #auth-screen button:not(.nav-link)');
    inputs.forEach(el => {
        if (disabled) {
            el.disabled = true;
        } else {
            el.disabled = false;
        }
    });
}

function setNavDisabled(disabled) {
    const navBtns = document.querySelectorAll('.navbar-actions .nav-link');
    navBtns.forEach(el => {
        if (disabled) {
            el.disabled = true;
            el.style.opacity = '0.6';
            el.style.cursor = 'not-allowed';
        } else {
            el.disabled = false;
            el.style.opacity = '1';
            el.style.cursor = 'pointer';
        }
    });
}

function showLoading(buttonId, message = 'Đang xử lý...') {
    isLoading = true;
    setLoading(buttonId, true, message);
    setAllInputsDisabled(true);
    setNavDisabled(true);
}

function hideLoading(buttonId) {
    isLoading = false;
    if (buttonId) {
        setLoading(buttonId, false);
    }
    setAllInputsDisabled(false);
    setNavDisabled(false);
}

// ===== SWITCH TO LOGIN =====
window.switchToLogin = function() {
    if (isLoading) return;
    
    // Cập nhật nav
    const navLogin = document.getElementById('navLogin');
    const navSignup = document.getElementById('navSignup');
    
    if (navLogin) {
        navLogin.classList.add('active');
        navLogin.classList.remove('signup-link');
    }
    if (navSignup) {
        navSignup.classList.remove('active');
        navSignup.classList.add('signup-link');
    }
    
    // Reset state
    foundUserData = null;
    foundUserUid = null;
    foundInDeleted = false;
    pendingDeletedUser = null;
    pendingSocialUser = null;
    pendingSocialProvider = null;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // Reset inputs
    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) passwordInput.value = '';
    
    const wrapper = document.getElementById('userInfoWrapper');
    if (wrapper) wrapper.classList.remove('visible');
    
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) avatarEl.innerHTML = 'T';
    
    const nameDisplay = document.getElementById('userNameDisplay');
    if (nameDisplay) nameDisplay.textContent = 'Xin chào, Người dùng';
    
    const emailDisplay = document.getElementById('userEmailDisplay');
    if (emailDisplay) emailDisplay.textContent = 'email@example.com';
    
    document.getElementById('emailInput').value = '';
    document.getElementById('resetEmailInput').value = '';
    
    document.getElementById('complete-name').value = '';
    document.getElementById('complete-email').value = '';
    document.getElementById('complete-email').disabled = false;
    document.getElementById('complete-terms').checked = false;
    
    // Ẩn tất cả form và hiện step-email
    hideAllForms();
    showForm('step-email');
    currentForm = 'login';
    
    setTimeout(() => {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) emailInput.focus();
    }, 300);
};

// ===== RESET VỀ FORM LOGIN =====
function resetToLoginForm() {
    if (isLoading) return;
    
    // Cập nhật nav
    const navLogin = document.getElementById('navLogin');
    const navSignup = document.getElementById('navSignup');
    
    if (navLogin) {
        navLogin.classList.add('active');
        navLogin.classList.remove('signup-link');
    }
    if (navSignup) {
        navSignup.classList.remove('active');
        navSignup.classList.add('signup-link');
    }
    
    foundUserData = null;
    foundUserUid = null;
    foundInDeleted = false;
    pendingDeletedUser = null;
    pendingSocialUser = null;
    pendingSocialProvider = null;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) passwordInput.value = '';
    
    const wrapper = document.getElementById('userInfoWrapper');
    if (wrapper) wrapper.classList.remove('visible');
    
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) avatarEl.innerHTML = 'T';
    
    const nameDisplay = document.getElementById('userNameDisplay');
    if (nameDisplay) nameDisplay.textContent = 'Xin chào, Người dùng';
    
    const emailDisplay = document.getElementById('userEmailDisplay');
    if (emailDisplay) emailDisplay.textContent = 'email@example.com';
    
    document.getElementById('emailInput').value = '';
    document.getElementById('resetEmailInput').value = '';
    
    document.getElementById('complete-name').value = '';
    document.getElementById('complete-email').value = '';
    document.getElementById('complete-email').disabled = false;
    document.getElementById('complete-terms').checked = false;
    
    // Ẩn tất cả form và hiện step-email
    hideAllForms();
    showForm('step-email');
    currentForm = 'login';
    
    setTimeout(() => {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) emailInput.focus();
    }, 300);
}

// ===== SWITCH TO SIGNUP =====
window.switchToSignup = function() {
    if (isLoading) return;
    
    const navLogin = document.getElementById('navLogin');
    const navSignup = document.getElementById('navSignup');
    
    if (navSignup) {
        navSignup.classList.add('active');
        navSignup.classList.remove('signup-link');
    }
    if (navLogin) {
        navLogin.classList.remove('active');
        navLogin.classList.add('signup-link');
    }
    
    // Reset state
    foundUserData = null;
    foundUserUid = null;
    foundInDeleted = false;
    pendingDeletedUser = null;
    pendingSocialUser = null;
    pendingSocialProvider = null;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // Reset password input
    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) passwordInput.value = '';
    
    const wrapper = document.getElementById('userInfoWrapper');
    if (wrapper) wrapper.classList.remove('visible');
    
    // Reset signup inputs
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-confirm').value = '';
    document.getElementById('terms-checkbox').checked = false;
    document.getElementById('strengthFill').style.width = '0%';
    document.getElementById('strengthLabel').textContent = 'Yếu';
    document.getElementById('strengthLabel').style.color = '#888';
    document.querySelectorAll('.req-item').forEach(el => {
        el.className = 'req-item unmet';
        el.querySelector('.req-icon').innerHTML = '<i class="fas fa-circle"></i>';
    });
    
    // Ẩn tất cả form và hiện signup-form
    hideAllForms();
    showForm('signup-form');
    currentForm = 'signup';
    
    const scrollable = document.getElementById('authScrollable');
    if (scrollable) {
        setTimeout(() => {
            scrollable.scrollTop = 0;
        }, 100);
    }
    
    setTimeout(() => {
        document.getElementById('signup-name').focus();
    }, 300);
};

// ===== QUAY LẠI FORM LOGIN TỪ SIGNUP =====
window.goBackToLoginFromSignup = function() {
    if (isLoading) return;
    
    // Cập nhật nav
    const navLogin = document.getElementById('navLogin');
    const navSignup = document.getElementById('navSignup');
    
    if (navLogin) {
        navLogin.classList.add('active');
        navLogin.classList.remove('signup-link');
    }
    if (navSignup) {
        navSignup.classList.remove('active');
        navSignup.classList.add('signup-link');
    }
    
    // Ẩn tất cả form và hiện step-email
    hideAllForms();
    showForm('step-email');
    currentForm = 'login';
    
    setTimeout(() => {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) emailInput.focus();
    }, 300);
};

// ===== GO BACK TO EMAIL =====
window.goBackToEmail = function() {
    if (isLoading) return;
    
    // Cập nhật nav
    const navLogin = document.getElementById('navLogin');
    const navSignup = document.getElementById('navSignup');
    
    if (navLogin) {
        navLogin.classList.add('active');
        navLogin.classList.remove('signup-link');
    }
    if (navSignup) {
        navSignup.classList.remove('active');
        navSignup.classList.add('signup-link');
    }
    
    // Reset state
    foundUserData = null;
    foundUserUid = null;
    foundInDeleted = false;
    pendingDeletedUser = null;
    pendingSocialUser = null;
    pendingSocialProvider = null;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) passwordInput.value = '';
    
    const wrapper = document.getElementById('userInfoWrapper');
    if (wrapper) wrapper.classList.remove('visible');
    
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) avatarEl.innerHTML = 'T';
    
    const nameDisplay = document.getElementById('userNameDisplay');
    if (nameDisplay) nameDisplay.textContent = 'Xin chào, Người dùng';
    
    const emailDisplay = document.getElementById('userEmailDisplay');
    if (emailDisplay) emailDisplay.textContent = 'email@example.com';
    
    document.getElementById('resetEmailInput').value = '';
    
    // Ẩn tất cả form và hiện step-email
    hideAllForms();
    showForm('step-email');
    currentForm = 'login';
    
    setTimeout(() => {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) emailInput.focus();
    }, 300);
};

// ===== GO BACK FROM FORGOT PASSWORD =====
window.goBackFromForgot = function() {
    goBackToEmail();
};

// ===== COMPLETE PROFILE FUNCTIONS =====
function showCompleteProfile(user, providerName) {
    pendingSocialUser = user;
    pendingSocialProvider = providerName;

    const avatarText = document.getElementById('socialAvatarText');
    const displayName = user.displayName || user.email?.split('@')[0] || 'Người dùng';
    if (avatarText) avatarText.textContent = displayName.charAt(0).toUpperCase();

    const avatarContainer = document.getElementById('socialAvatar');
    if (avatarContainer) {
        if (user.photoURL) {
            avatarContainer.innerHTML = `<img src="${user.photoURL}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            avatarContainer.innerHTML = `<span id="socialAvatarText">${displayName.charAt(0).toUpperCase()}</span>`;
        }
    }

    const emailInput = document.getElementById('complete-email');
    if (emailInput) {
        emailInput.value = user.email || '';
        emailInput.disabled = false;
    }
    
    const nameInput = document.getElementById('complete-name');
    if (nameInput) nameInput.value = displayName;

    // Ẩn tất cả form và hiện complete-profile-form
    hideAllForms();
    showForm('complete-profile-form');
    currentForm = 'complete';
}

window.handleCompleteProfileBack = () => {
    if (isLoading) return;
    
    if (pendingSocialUser) {
        signOut(auth);
        pendingSocialUser = null;
        pendingSocialProvider = null;
    }
    // Ẩn tất cả form và hiện step-email
    hideAllForms();
    showForm('step-email');
    currentForm = 'login';
    
    setTimeout(() => {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) emailInput.focus();
    }, 300);
};

window.handleCompleteProfile = async () => {
    if (isLoading) return;
    
    const name = document.getElementById('complete-name').value.trim();
    const email = document.getElementById('complete-email').value.trim();
    const gender = document.getElementById('complete-gender').value;
    const birthday = document.getElementById('complete-birthday').value;
    const termsChecked = document.getElementById('complete-terms').checked;

    if (!name) {
        showToast('Thông báo', 'Vui lòng nhập họ và tên.', 'warning');
        document.getElementById('complete-name').focus();
        return;
    }

    if (!email) {
        showToast('Thông báo', 'Email không được để trống.', 'warning');
        document.getElementById('complete-email').focus();
        return;
    }

    if (!email.includes('@') || !email.includes('.')) {
        showToast('Lỗi', 'Email không hợp lệ. Vui lòng nhập email đúng định dạng.', 'error');
        document.getElementById('complete-email').focus();
        return;
    }

    if (!birthday) {
        showToast('Thông báo', 'Vui lòng chọn ngày sinh.', 'warning');
        document.getElementById('complete-birthday').focus();
        return;
    }

    const age = checkAge(birthday);
    if (age < 12) {
        showToast('Yêu cầu độ tuổi', 'Bạn cần phải trên 12 tuổi để sử dụng dịch vụ.', 'error');
        document.getElementById('complete-birthday').focus();
        return;
    }

    if (!termsChecked) {
        showToast('Thông báo', 'Vui lòng đồng ý với Điều khoản sử dụng.', 'warning');
        return;
    }

    if (!pendingSocialUser) {
        showToast('Lỗi', 'Không tìm thấy thông tin đăng nhập. Vui lòng thử lại.', 'error');
        return;
    }

    showLoading('btnNextComplete', 'Đang hoàn thiện thông tin...');

    try {
        const uid = pendingSocialUser.uid;

        const usersRef = ref(db, 'users');
        const q = query(usersRef, orderByChild('email'), equalTo(email.toLowerCase()));
        const snap = await get(q);

        let emailExists = false;
        if (snap.exists()) {
            const users = snap.val();
            for (const [uId, data] of Object.entries(users)) {
                if (uId !== uid && data.email && data.email.toLowerCase() === email.toLowerCase()) {
                    emailExists = true;
                    break;
                }
            }
        }

        if (emailExists) {
            hideLoading('btnNextComplete');
            showToast('Lỗi', 'Email này đã được đăng ký. Vui lòng sử dụng email khác.', 'error');
            document.getElementById('complete-email').focus();
            document.getElementById('complete-email').select();
            return;
        }

        let avatarData = null;
        if (pendingSocialUser.photoURL) {
            try {
                const response = await fetch(pendingSocialUser.photoURL);
                const blob = await response.blob();
                const reader = new FileReader();
                avatarData = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.warn('Không thể tải ảnh đại diện từ social:', e);
            }
        }

        function generateUserId() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let id = '';
            for (let i = 0; i < 8; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        }

        let userId = generateUserId();
        let isDuplicate = true;
        let attempts = 0;
        
        while (isDuplicate && attempts < 20) {
            const checkSnap = await get(ref(db, `users_by_id/${userId}`));
            if (!checkSnap.exists()) {
                isDuplicate = false;
            } else {
                userId = generateUserId();
                attempts++;
            }
        }

        const userData = {
            email: email.toLowerCase(),
            name: name,
            gender: gender || 'Nam',
            birthday: birthday || '2000-01-01',
            showGender: true,
            showBirthday: true,
            allowStrangerChat: true,
            allowFriendRequest: true,
            allowSearch: true,
            allowLinkSearch: true,
            isLocked: false,
            haveGreenTick: false,
            providers: [pendingSocialProvider],
            userId: userId,
            lockInfo: {
                id: "---",
                reason: "---",
                start: "---",
                end: "---",
            }
        };

        if (avatarData) {
            userData.avatar = avatarData;
        }

        await set(ref(db, `users/${uid}`), userData);
        await set(ref(db, `users_by_id/${userId}`), uid);

        hideLoading('btnNextComplete');
        showToast('Thành công', 'Hoàn tất đăng ký tài khoản thành công!', 'success');
        
        pendingSocialUser = null;
        pendingSocialProvider = null;

        setTimeout(() => {
            window.location.href = "chat.html";
        }, 1000);

    } catch (error) {
        hideLoading('btnNextComplete');
        console.error('Lỗi hoàn thiện thông tin:', error);
        showToast('Lỗi', 'Không thể hoàn thiện thông tin. Vui lòng thử lại.', 'error');
    }
};

// ===== SOCIAL LOGIN - GOOGLE =====
window.handleGoogleLogin = async () => {
    if (isLoading) return;
    
    const provider = new GoogleAuthProvider();
    showLoading('btnGoogleLogin', 'Đang đăng nhập với Google...');

    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        const snap = await get(ref(db, `users/${user.uid}`));
        
        if (!snap.exists()) {
            const deletedSnap = await get(ref(db, `deleted_users/${user.uid}`));
            if (deletedSnap.exists()) {
                hideLoading('btnGoogleLogin');
                showDeletedForm(user.uid, deletedSnap.val());
                return;
            }
            
            hideLoading('btnGoogleLogin');
            showCompleteProfile(user, 'google');
            return;
        }

        const userData = snap.val();
        if (userData.isLocked === true || userData.isLocked === "true") {
            await signOut(auth);
            hideLoading('btnGoogleLogin');
            const lockInfo = userData.lockInfo || { id: '---', reason: '---', start: '---', end: '---' };
            showLockForm(lockInfo);
            return;
        }

        hideLoading('btnGoogleLogin');
        showToast('Thành công', 'Đăng nhập thành công!', 'success');
        setTimeout(() => {
            window.location.href = "chat.html";
        }, 500);
        
    } catch (error) {
        console.error('Lỗi đăng nhập Google:', error);
        hideLoading('btnGoogleLogin');
        
        if (error.code === 'auth/popup-closed-by-user') {
            showToast('Thông báo', 'Bạn đã đóng cửa sổ đăng nhập.', 'warning');
        } else if (error.code === 'auth/user-disabled') {
            showToast('Lỗi', 'Access denied [8203]', 'error');
        }
    }
};

// ===== SHOW FORGOT PASSWORD FORM =====
window.showForgotPasswordForm = () => {
    if (isLoading) return;
    
    // Ẩn tất cả form và hiện forgot-form
    hideAllForms();
    showForm('forgot-form');
    currentForm = 'forgot';
    
    setTimeout(() => {
        document.getElementById('resetEmailInput').focus();
    }, 300);
};

// ===== SHOW LOCK FORM =====
function showLockForm(lockInfo) {
    const container = document.getElementById('lockInfoContent');
    if (!container) return;
    
    const fields = [
        { label: 'ID', value: lockInfo.id || '---' },
        { label: 'Lý do', value: lockInfo.reason || '---' },
        { label: 'Bắt đầu', value: lockInfo.start || '---' },
        { label: 'Kết thúc', value: lockInfo.end || '---' }
    ];

    let html = '';
    fields.forEach(field => {
        html += `<div class="lock-info-item"><span class="label">${field.label}</span><span class="value">${field.value}</span></div>`;
    });
    container.innerHTML = html;

    // Ẩn tất cả form và hiện lock-form
    hideAllForms();
    showForm('lock-form');
    currentForm = 'lock';
}

// ===== HIỂN THỊ FORM TÀI KHOẢN ĐÃ XÓA =====
function showDeletedForm(uid, deletedData) {
    pendingDeletedUser = { uid, data: deletedData };
    
    const container = document.getElementById('deletedInfoContent');
    if (!container) return;
    
    const fields = [
        { label: 'Email', value: deletedData.email || '---' },
        { label: 'Tên', value: deletedData.name || '---' },
        { label: 'Thời gian', value: new Date(deletedData.deletedAt).toLocaleString('vi-VN') }
    ];

    let html = '';
    fields.forEach(field => {
        html += `<div class="lock-info-item"><span class="label">${field.label}</span><span class="value">${field.value}</span></div>`;
    });
    container.innerHTML = html;

    startCountdown(deletedData.expiresAt);
    
    // Ẩn tất cả form và hiện deleted-form
    hideAllForms();
    showForm('deleted-form');
    currentForm = 'deleted';
}

// ===== START COUNTDOWN =====
function startCountdown(expiresAt) {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    const display = document.getElementById('countdownDisplay');
    
    function updateCountdown() {
        const now = Date.now();
        const remaining = expiresAt - now;
        
        if (remaining <= 0) {
            display.textContent = 'Đã hết hạn!';
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            return;
        }
        
        const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
        
        let text = '';
        if (days > 0) {
            text = `${days} ngày ${hours} giờ ${minutes} phút`;
        } else if (hours > 0) {
            text = `${hours} giờ ${minutes} phút ${seconds} giây`;
        } else if (minutes > 0) {
            text = `${minutes} phút ${seconds} giây`;
        } else {
            text = `${seconds} giây`;
        }
        
        display.textContent = text;
    }
    
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// ===== KHÔI PHỤC TÀI KHOẢN =====
window.handleRestoreAccount = async () => {
    if (isLoading) return;
    
    if (!pendingDeletedUser) {
        showToast('Lỗi', 'Không tìm thấy thông tin khôi phục.', 'error');
        return;
    }
    
    try {
        showLoading('btnRestoreAccount', 'Đang khôi phục tài khoản...');
        
        const uid = pendingDeletedUser.uid;
        let deletedData = pendingDeletedUser.data;
        
        if (!deletedData) {
            const snap = await get(ref(db, `deleted_users/${uid}`));
            if (!snap.exists()) {
                hideLoading('btnRestoreAccount');
                showToast('Lỗi', 'Không tìm thấy dữ liệu khôi phục.', 'error');
                return;
            }
            deletedData = snap.val();
        }
        
        const now = Date.now();
        if (now > deletedData.expiresAt) {
            hideLoading('btnRestoreAccount');
            showToast('Lỗi', 'Tài khoản của bạn đã bị xóa vĩnh viễn do quá thời gian khôi phục', 'error');
            setTimeout(() => {
                window.location.href = "index.html";
            }, 2000);
            return;
        }
        
        const userData = deletedData.data || {};
        userData.restoredAt = now;
        userData.restoredFromDelete = true;
        userData.email = deletedData.email || auth.currentUser?.email;
        
        if (!userData.name) {
            userData.name = deletedData.name || 'Người dùng';
        }
        
        if (!userData.userId) {
            function generateUserId() {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let id = '';
                for (let i = 0; i < 8; i++) {
                    id += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return id;
            }
            
            let userId = generateUserId();
            let isDuplicate = true;
            let attempts = 0;
            
            while (isDuplicate && attempts < 20) {
                const checkSnap = await get(ref(db, `users_by_id/${userId}`));
                if (!checkSnap.exists()) {
                    isDuplicate = false;
                } else {
                    userId = generateUserId();
                    attempts++;
                }
            }
            userData.userId = userId;
        }
        
        await set(ref(db, `users/${uid}`), userData);
        
        if (userData.userId) {
            await set(ref(db, `users_by_id/${userData.userId}`), uid);
        }
        
        await remove(ref(db, `deleted_users/${uid}`));
        
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        
        hideLoading('btnRestoreAccount');
        pendingDeletedUser = null;
        
        showToast('Thành công', 'Tài khoản đã được khôi phục!', 'success');
        
        setTimeout(() => {
            window.location.href = "chat.html";
        }, 1000);
        
    } catch (error) {
        hideLoading('btnRestoreAccount');
        console.error('Lỗi khôi phục:', error);
        showToast('Lỗi', 'Không thể khôi phục tài khoản. Vui lòng thử lại.', 'error');
    }
};

// ===== TOGGLE PASSWORD =====
window.togglePassword = (inputId, button) => {
    if (isLoading) return;
    
    const input = document.getElementById(inputId);
    if (!input || input.disabled) return;

    const icon = button.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
};

// ===== STEP 1: HANDLE EMAIL =====
window.handleEmailStep = async () => {
    if (isLoading) return;
    
    const email = document.getElementById('emailInput').value.trim();

    if (!email) {
        showToast('Thông báo', 'Vui lòng nhập email của bạn.', 'warning');
        document.getElementById('emailInput').focus();
        return;
    }

    if (!email.includes('@') || !email.includes('.')) {
        showToast('Lỗi', 'Email không hợp lệ. Vui lòng kiểm tra lại.', 'error');
        document.getElementById('emailInput').focus();
        return;
    }

    showLoading('btnEmailNext', 'Đang kiểm tra thông tin...');

    try {
        let found = false;
        let userData = null;
        let userUid = null;

        const usersRef = ref(db, 'users');
        const q = query(usersRef, orderByChild('email'), equalTo(email.toLowerCase()));
        const snap = await get(q);

        if (snap.exists()) {
            const users = snap.val();
            for (const [uid, data] of Object.entries(users)) {
                if (data.email && data.email.toLowerCase() === email.toLowerCase()) {
                    found = true;
                    userData = data;
                    userUid = uid;
                    foundInDeleted = false;
                    break;
                }
            }
        }

        if (!found) {
            const deletedSnap = await get(ref(db, 'deleted_users'));
            if (deletedSnap.exists()) {
                const deletedUsers = deletedSnap.val();
                for (const [uid, data] of Object.entries(deletedUsers)) {
                    if (data.email && data.email.toLowerCase() === email.toLowerCase()) {
                        found = true;
                        userData = data;
                        userUid = uid;
                        foundInDeleted = true;
                        break;
                    }
                }
            }
        }

        if (!found) {
            hideLoading('btnEmailNext');
            showToast('Không tìm thấy', 'Không tìm thấy tài khoản với email này. Vui lòng kiểm tra lại hoặc tạo tài khoản mới.', 'error');
            document.getElementById('emailInput').focus();
            document.getElementById('emailInput').select();
            return;
        }

        foundUserData = userData;
        foundUserUid = userUid;

        renderUserInfo(userData);
        
        hideLoading('btnEmailNext');
        // Chuyển sang form nhập mật khẩu
        hideAllForms();
        showForm('step-password');
        currentForm = 'password';
        
        setTimeout(() => {
            document.getElementById('passwordInput').focus();
        }, 400);

    } catch (error) {
        hideLoading('btnEmailNext');
        console.error('Lỗi tìm kiếm user:', error);
        showToast('Lỗi', 'Có lỗi xảy ra. Vui lòng thử lại sau.', 'error');
    }
};

function renderUserInfo(userData) {
    if (!userData) {
        console.warn('userData is null or undefined');
        return;
    }
    
    const wrapper = document.getElementById('userInfoWrapper');
    const avatarEl = document.getElementById('userAvatar');
    const nameEl = document.getElementById('userNameDisplay');
    const emailEl = document.getElementById('userEmailDisplay');
    
    const name = (userData.name && userData.name.trim()) || 'Người dùng';
    const email = (userData.email && userData.email.trim()) || '';
    const avatar = userData.avatar || null;
    
    if (avatar && avatar.startsWith('data:image')) {
        avatarEl.innerHTML = `<img src="${avatar}" alt="${name}">`;
    } else {
        avatarEl.innerHTML = name.charAt(0).toUpperCase();
    }
    
    nameEl.textContent = `Xin chào, ${name}`;
    emailEl.textContent = email || 'email@example.com';
    
    if (wrapper) wrapper.classList.add('visible');
}

// ===== STEP 2: HANDLE PASSWORD =====
window.handlePasswordStep = async () => {
    if (isLoading) return;
    
    const password = document.getElementById('passwordInput').value;

    if (!password) {
        showToast('Thông báo', 'Vui lòng nhập mật khẩu.', 'warning');
        document.getElementById('passwordInput').focus();
        return;
    }

    if (password.length < 6) {
        showToast('Thông báo', 'Mật khẩu phải có ít nhất 6 ký tự.', 'warning');
        document.getElementById('passwordInput').focus();
        return;
    }

    showLoading('btnPasswordLogin', 'Đang đăng nhập...');

    try {
        const email = foundUserData.email;
        
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        const snap = await get(ref(db, `users/${userCredential.user.uid}`));
        if (snap.exists()) {
            const userData = snap.val();
            if (userData.isLocked === true || userData.isLocked === "true") {
                await signOut(auth);
                hideLoading('btnPasswordLogin');
                const lockInfo = userData.lockInfo || { id: '---', reason: '---', start: '---', end: '---' };
                showLockForm(lockInfo);
                return;
            }
            
            hideLoading('btnPasswordLogin');
            window.location.href = "chat.html";
            return;
        } 
        
        const deletedSnap = await get(ref(db, `deleted_users/${userCredential.user.uid}`));
        if (deletedSnap.exists()) {
            await signOut(auth);
            hideLoading('btnPasswordLogin');
            showDeletedForm(userCredential.user.uid, deletedSnap.val());
            return;
        }
        
        await signOut(auth);
        hideLoading('btnPasswordLogin');
        showToast('Lỗi', 'Tài khoản không tồn tại. Vui lòng kiểm tra lại.', 'error');
        
    } catch (error) {
        hideLoading('btnPasswordLogin');
        console.error('Lỗi đăng nhập:', error);
        
        if (error.code === 'auth/user-disabled') {
            showToast('Lỗi', 'Access denied [8203]', 'error');
            return;
        }
        
        let message = 'Email hoặc mật khẩu không đúng.';
        if (error.code === 'auth/user-not-found') {
            message = 'Không tìm thấy tài khoản với email này.';
        } else if (error.code === 'auth/wrong-password') {
            message = 'Mật khẩu không đúng. Vui lòng thử lại.';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'Quá nhiều lần thử sai. Vui lòng thử lại sau.';
        } else if (error.code === 'auth/network-request-failed') {
            message = 'Lỗi kết nối mạng. Vui lòng kiểm tra internet.';
        } else if (error.code === 'auth/user-disabled') {
            message = 'Access denied [8203]'
        }
        showToast('Lỗi đăng nhập', message, 'error');
        document.getElementById('passwordInput').focus();
        document.getElementById('passwordInput').select();
    }
};

// ===== HANDLE FORGOT PASSWORD =====
window.handleForgotPassword = async () => {
    if (isLoading) return;
    
    const email = document.getElementById('resetEmailInput').value.trim();

    if (!email) {
        showToast('Thông báo', 'Vui lòng nhập email của bạn.', 'warning');
        document.getElementById('resetEmailInput').focus();
        return;
    }

    if (!email.includes('@') || !email.includes('.')) {
        showToast('Lỗi', 'Email không hợp lệ. Vui lòng kiểm tra lại.', 'error');
        document.getElementById('resetEmailInput').focus();
        return;
    }

    showLoading('btnForgotPassword', 'Đang gửi yêu cầu...');

    try {
        await sendPasswordResetEmail(auth, email);
        hideLoading('btnForgotPassword');
        showToast('Thành công', 'Đã gửi email khôi phục mật khẩu. Vui lòng kiểm tra hộp thư.', 'success');
        setTimeout(() => resetToLoginForm(), 1500);
    } catch (error) {
        hideLoading('btnForgotPassword');
        console.error('Lỗi gửi email:', error);
        
        let message = 'Không thể gửi email khôi phục mật khẩu.';
        if (error.code === 'auth/user-not-found') {
            message = 'Không tìm thấy tài khoản với email này.';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'Quá nhiều yêu cầu. Vui lòng thử lại sau.';
        } else if (error.code === 'auth/network-request-failed') {
            message = 'Lỗi kết nối mạng. Vui lòng kiểm tra internet.';
        } else if (error.code === 'auth/user-disabled') {
            message = 'Access denied [8203]';
        }
        showToast('Lỗi', message, 'error');
    }
};

// ===== PASSWORD STRENGTH CHECKER =====
function checkPasswordStrength(password) {
    const checks = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        digit: /[0-9]/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };

    const metCount = Object.values(checks).filter(Boolean).length;

    let strength = 'weak';
    let label = 'Yếu';
    let color = '#f02849';
    let width = 20;

    if (metCount >= 5) {
        strength = 'strong';
        label = 'Mạnh';
        color = '#2e7d32';
        width = 100;
    } else if (metCount >= 4) {
        strength = 'medium';
        label = 'Trung bình';
        color = '#f39c12';
        width = 75;
    } else if (metCount >= 3) {
        strength = 'medium-weak';
        label = 'Trung bình yếu';
        color = '#f1c40f';
        width = 50;
    } else if (metCount >= 2) {
        strength = 'weak';
        label = 'Yếu';
        color = '#e67e22';
        width = 30;
    } else {
        strength = 'very-weak';
        label = 'Rất yếu';
        color = '#f02849';
        width = 10;
    }

    return {
        strength,
        label,
        color,
        width,
        metCount,
        checks,
        isValid: strength === 'strong' || strength === 'medium'
    };
}

function updatePasswordStrengthUI(password) {
    const fill = document.getElementById('strengthFill');
    const label = document.getElementById('strengthLabel');
    const result = checkPasswordStrength(password);

    fill.style.width = result.width + '%';
    fill.style.backgroundColor = result.color;
    label.textContent = result.label;
    label.style.color = result.color;

    const reqMap = {
        length: document.getElementById('reqLength'),
        uppercase: document.getElementById('reqUppercase'),
        lowercase: document.getElementById('reqLowercase'),
        digit: document.getElementById('reqDigit'),
        special: document.getElementById('reqSpecial')
    };

    Object.keys(reqMap).forEach(key => {
        const el = reqMap[key];
        const met = result.checks[key];
        el.className = `req-item ${met ? 'met' : 'unmet'}`;
        el.querySelector('.req-icon').innerHTML = met ? '<i class="fas fa-check-circle"></i>' :
            '<i class="fas fa-circle"></i>';
    });

    return result;
}

// ===== HANDLE SIGNUP =====
window.handleSignup = async () => {
    if (isLoading) return;
    
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    const gender = document.getElementById('signup-gender').value;
    const birthday = document.getElementById('signup-birthday').value;

    if (!name || !email || !password || !confirm) {
        showToast('Thông báo', 'Vui lòng điền đầy đủ thông tin.', 'warning');
        return;
    }

    if (!email.includes('@') || !email.includes('.')) {
        showToast('Lỗi', 'Email không hợp lệ.', 'error');
        return;
    }

    if (!birthday) {
        showToast('Thông báo', 'Vui lòng chọn ngày sinh.', 'warning');
        document.getElementById('signup-birthday').focus();
        return;
    }

    const age = checkAge(birthday);
    if (age < 12) {
        showToast('Yêu cầu độ tuổi', 'Bạn cần phải trên 12 tuổi để sử dụng dịch vụ.', 'error');
        document.getElementById('signup-birthday').focus();
        return;
    }

    const strengthResult = checkPasswordStrength(password);
    if (!strengthResult.isValid) {
        showToast('Mật khẩu yếu', 'Vui lòng tạo mật khẩu mạnh hơn với ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.',
            'error');
        return;
    }

    if (password !== confirm) {
        showToast('Lỗi', 'Mật khẩu xác nhận không khớp.', 'error');
        return;
    }

    if (!document.getElementById('terms-checkbox').checked) {
        showToast('Thông báo', 'Vui lòng đồng ý với Điều khoản sử dụng.', 'warning');
        return;
    }

    showLoading('btnSignup', 'Đang tạo tài khoản...');

    try {
        isSigningUp = true;
        const res = await createUserWithEmailAndPassword(auth, email, password);

        function generateUserId() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let id = '';
            for (let i = 0; i < 8; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        }

        let userId = generateUserId();
        let isDuplicate = true;
        let attempts = 0;
        
        while (isDuplicate && attempts < 20) {
            const checkSnap = await get(ref(db, `users_by_id/${userId}`));
            if (!checkSnap.exists()) {
                isDuplicate = false;
            } else {
                userId = generateUserId();
                attempts++;
            }
        }

        await set(ref(db, `users/${res.user.uid}`), {
            email: email.toLowerCase(),
            name: name,
            gender: gender || 'Nam',
            birthday: birthday || '2000-01-01',
            showGender: true,
            showBirthday: true,
            allowStrangerChat: true,
            allowFriendRequest: true,
            allowSearch: true,
            allowLinkSearch: true,
            isLocked: false,
            haveGreenTick: false,
            providers: ['password'],
            userId: userId,
            lockInfo: {
                id: "---",
                reason: "---",
                start: "---",
                end: "---",
            }
        });

        await set(ref(db, `users_by_id/${userId}`), res.user.uid);

        isSigningUp = false;
        hideLoading('btnSignup');
        showToast('Thành công', 'Đăng ký tài khoản thành công!', 'success');
        setTimeout(() => {
            window.location.href = "chat.html";
        }, 1000);
    } catch (error) {
        isSigningUp = false;
        hideLoading('btnSignup');
        console.error('Lỗi đăng ký:', error);
        showToast('Lỗi', getFirebaseErrorMessage(error.code), 'error');
    }
};

// ===== FIREBASE ERROR =====
function getFirebaseErrorMessage(errorCode) {
    const messages = {
        'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
        'auth/invalid-email': 'Email không hợp lệ.',
        'auth/email-already-in-use': 'Email này đã được sử dụng.',
        'auth/weak-password': 'Mật khẩu phải có ít nhất 6 ký tự.',
        'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
        'auth/too-many-requests': 'Lưu lượng truy cập quá cao. Vui lòng thử lại sau.',
        'auth/network-request-failed': 'Lỗi kết nối mạng. Vui lòng kiểm tra internet.',
        'auth/admin-restricted-operation': 'Quyền đăng ký tài khoản đã bị hạn chế.',
        'auth/user-disabled': 'Access denied [8203]',
        'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập.',
        'auth/account-exists-with-different-credential': 'Email này đã được đăng ký với phương thức khác.',
        'default': 'Đã xảy ra lỗi. Vui lòng thử lại sau.'
    };
    return messages[errorCode] || messages.default;
}

// ===== KEYPRESS =====
document.getElementById('emailInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleEmailStep();
});

document.getElementById('passwordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handlePasswordStep();
});

document.getElementById('resetEmailInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleForgotPassword();
});

document.getElementById('signup-email').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('signup-password').focus();
    }
});

document.getElementById('signup-password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('signup-confirm').focus();
    }
});

document.getElementById('signup-confirm').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleSignup();
});

document.getElementById('complete-name').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('complete-email').focus();
    }
});

document.getElementById('complete-email').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('complete-gender').focus();
    }
});

document.getElementById('complete-gender').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('complete-birthday').focus();
    }
});

document.getElementById('complete-birthday').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('complete-terms').focus();
    }
});

document.getElementById('complete-terms').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        handleCompleteProfile();
    }
});

// ===== PASSWORD STRENGTH REAL-TIME =====
document.getElementById('signup-password').addEventListener('input', function() {
    updatePasswordStrengthUI(this.value);
});

// ===== AUTH STATE =====
onAuthStateChanged(auth, async (user) => {
    if (user && !isSigningUp) {
        try {
            const snap = await get(ref(db, `users/${user.uid}`));
            
            if (!snap.exists()) {
                const deletedSnap = await get(ref(db, `deleted_users/${user.uid}`));
                if (deletedSnap.exists()) {
                    await signOut(auth);
                    showDeletedForm(user.uid, deletedSnap.val());
                    return;
                }
                
                if (user.providerData && user.providerData.length > 0) {
                    const provider = user.providerData[0].providerId;
                    const providerName = provider === 'google.com' ? 'google' : 'password';
                    if (providerName !== 'password') {
                        pendingSocialUser = user;
                        pendingSocialProvider = providerName;
                        showCompleteProfile(user, providerName);
                        return;
                    }
                }
                await signOut(auth);
                showToast('Thông báo', 'Tài khoản chưa được đăng ký đầy đủ.', 'warning');
                return;
            }

            const userData = snap.val();
            
            if (userData.isLocked === true || userData.isLocked === "true") {
                await signOut(auth);
                const lockInfo = userData.lockInfo || { 
                    id: '---', 
                    reason: '---', 
                    start: '---', 
                    end: '---' 
                };
                showLockForm(lockInfo);
                return;
            }
            
            const params = new URLSearchParams(window.location.search);
            const redirect = params.get('redirect');
            const redirectUid = params.get('uid');
            
            if (redirect === 'chat' && redirectUid) {
                window.location.href = `chat.html?uid=${redirectUid}`;
            } else {
                window.location.href = "chat.html";
            }
        } catch (error) {
            console.error('Lỗi kiểm tra tài khoản:', error);
            window.location.href = "chat.html";
        }
    }
});

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
    // Hiển thị step-email mặc định
    hideAllForms();
    showForm('step-email');
    currentForm = 'login';
    
    // Cập nhật nav - active login
    const navLogin = document.getElementById('navLogin');
    const navSignup = document.getElementById('navSignup');
    
    if (navLogin) {
        navLogin.classList.add('active');
        navLogin.classList.remove('signup-link');
    }
    if (navSignup) {
        navSignup.classList.remove('active');
        navSignup.classList.add('signup-link');
    }

    setMobileHeight();

    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(setMobileHeight, 200);
    });

    window.addEventListener('orientationchange', function() {
        setTimeout(setMobileHeight, 300);
    });

    setTimeout(() => {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) emailInput.focus();
    }, 500);
});

// ===== EXPOSE TO WINDOW =====
window.resetToLoginForm = resetToLoginForm;
window.showLockForm = showLockForm;
window.showDeletedForm = showDeletedForm;
window.startCountdown = startCountdown;
window.switchToLogin = switchToLogin;
window.switchToSignup = switchToSignup;
window.goBackToEmail = goBackToEmail;
window.goBackToLoginFromSignup = goBackToLoginFromSignup;
window.goBackFromForgot = goBackFromForgot;
