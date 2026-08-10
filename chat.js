import { 
    initializeApp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    updatePassword, 
    deleteUser, 
    reauthenticateWithCredential, 
    EmailAuthProvider, 
    GoogleAuthProvider, 
    signInWithPopup,
    linkWithCredential 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, query, orderByChild, equalTo, get, remove, off, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

let currentUser = null, activeChatId = null;
let pendingConfirmCallback = null;
let isChatActive = false, currentChatUid = null;
let selectedFiles = [];
let selectedFilesData = [];
let replyToMessage = null;
let avatarFileData = null;
let pendingDeleteMsgId = null;

let selectedMsgId = null;
let selectedMsgSender = null;
let selectedMsgText = '';
let selectedMsgFile = null;
let selectedMsgSenderName = '';
let selectedMsgIsOwn = false;
let isMobile = window.innerWidth <= 790;
let longPressTimer = null;
let userCache = {};

let globalFriendStatusListener = null, globalMessagesListener = null;
let currentUserListenerRef = null, currentStatusListenerRef = null;
let currentClearListenerRef = null;
let messagesUnsubscribe = null;

let userInfoModalObj = null, privacySettingsModalObj = null;
let searchModalObj = null;
let aboutModalObj = null;
let deleteForMeModalObj = null;
let currentSearchTarget = null;

let activeModalInstance = null;
let ageWarningModalObj = null;
let ageWarningShown = false;
let userDataCache = {};

// ===== SESSION MANAGEMENT VARIABLES =====
let sessionListenerRef = null;
let isLoggingOut = false; // Đánh dấu đang đăng xuất chủ động
let sessionsListenerRef = null; // Listener cho realtime sessions

// ===== SWIPE TO REPLY VARIABLES =====
let swipeStartX = 0;
let swipeStartY = 0;
let swipeCurrentX = 0;
let swipeTargetMsg = null;
let swipeIsActive = false;
let swipeThreshold = 50;

// =====================================================
// ===== QUẢN LÝ PHIÊN ĐĂNG NHẬP (SESSION MANAGEMENT) =====
// =====================================================

// ===== TẠO SESSION ID =====
function generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
}

// ===== LẤY ĐỊA CHỈ IP =====
async function getIPAddress() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip || 'Không xác định';
    } catch (error) {
        console.warn('Không thể lấy IP:', error);
        return 'Không xác định';
    }
}

// ===== LẤY THÔNG TIN THIẾT BỊ - CÓ LƯU VÀO LOCALSTORAGE =====
function getDeviceInfo() {
    const ua = navigator.userAgent;
    
    // Lấy deviceId từ localStorage hoặc tạo mới
    let deviceId = localStorage.getItem('viechat_device_id');
    
    if (!deviceId) {
        // Tạo deviceId ổn định - THÊM NHIỀU THÔNG TIN HƠN
        const screenInfo = `${window.screen.width}x${window.screen.height}`;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const platform = navigator.platform || 'unknown';
        const hardwareConcurrency = navigator.hardwareConcurrency || 'unknown';
        const language = navigator.language || 'unknown';
        const userAgent = navigator.userAgent;
        
        // Lấy thông tin GPU (nếu có)
        let gpuInfo = 'unknown';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    gpuInfo = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
                }
            }
        } catch (e) {
            gpuInfo = 'unknown';
        }
        
        // Lấy thông tin về touch support
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Tạo stableId với nhiều thông tin hơn
        const stableId = `${platform}|${screenInfo}|${timezone}|${hardwareConcurrency}|${language}|${hasTouch}|${gpuInfo.substring(0, 20)}`;
        deviceId = btoa(stableId).substring(0, 32);
        
        // Lưu vào localStorage
        localStorage.setItem('viechat_device_id', deviceId);
        console.log('📱 Đã tạo deviceId mới:', deviceId);
    } else {
        console.log('📱 Sử dụng deviceId đã có:', deviceId);
    }
    
    // Phân loại thiết bị
    let deviceType = "web";
    if (/mobile/i.test(ua)) deviceType = "mobile";
    else if (/tablet/i.test(ua)) deviceType = "tablet";
    else if (/Windows|Macintosh|Linux/i.test(ua)) deviceType = "desktop";
    
    // Lấy tên thiết bị CHI TIẾT HƠN
    let deviceName = "Unknown Device";
    if (/iPhone/.test(ua)) {
        const iosMatch = ua.match(/iPhone OS ([0-9_]+)/);
        const iosVersion = iosMatch ? iosMatch[1].replace(/_/g, '.') : '';
        deviceName = `iPhone (iOS ${iosVersion})`;
    }
    else if (/iPad/.test(ua)) {
        const iosMatch = ua.match(/iPad OS ([0-9_]+)/);
        const iosVersion = iosMatch ? iosMatch[1].replace(/_/g, '.') : '';
        deviceName = `iPad (iOS ${iosVersion})`;
    }
    else if (/Android/.test(ua)) {
        const androidMatch = ua.match(/Android\s+([\d.]+)/);
        const androidVersion = androidMatch ? androidMatch[1] : '';
        let brand = 'Android';
        const brandMatch = ua.match(/;\\s*([^;]+?)\\s*Build/);
        if (brandMatch) {
            brand = brandMatch[1].trim();
        }
        // Lấy model
        let model = '';
        const modelMatch = ua.match(/;\s*([^;]+?)\s*\)/);
        if (modelMatch && !modelMatch[1].includes('Build')) {
            model = modelMatch[1].trim();
        }
        deviceName = `${brand} ${model} (Android ${androidVersion})`;
    }
    else if (/Windows NT 10.0/.test(ua)) deviceName = "Windows PC";
    else if (/Windows NT 6.1/.test(ua)) deviceName = "Windows 7";
    else if (/Macintosh/.test(ua)) {
        const osMatch = ua.match(/Mac OS X ([0-9_]+)/);
        const osVersion = osMatch ? osMatch[1].replace(/_/g, '.') : '';
        deviceName = `Mac (macOS ${osVersion})`;
    }
    else if (/Linux/.test(ua) && !/Android/.test(ua)) deviceName = "Linux PC";
    
    // Lấy OS
    let os = "Unknown";
    if (/Windows NT 10.0/.test(ua)) os = "Windows 10/11";
    else if (/Windows NT 6.1/.test(ua)) os = "Windows 7";
    else if (/Windows NT 6.2/.test(ua)) os = "Windows 8";
    else if (/Mac OS X/.test(ua)) {
        const osMatch = ua.match(/Mac OS X ([0-9_]+)/);
        os = `macOS ${osMatch ? osMatch[1].replace(/_/g, '.') : ''}`;
    }
    else if (/Android/.test(ua)) {
        const androidMatch = ua.match(/Android\s+([\d.]+)/);
        os = `Android ${androidMatch ? androidMatch[1] : ''}`;
    }
    else if (/iOS|iPhone|iPad/.test(ua)) {
        const iosMatch = ua.match(/OS ([0-9_]+)/);
        os = `iOS ${iosMatch ? iosMatch[1].replace(/_/g, '.') : ''}`;
    }
    else if (/Linux/.test(ua)) os = "Linux";
    
    // Lấy browser
    let browser = "Unknown";
    if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = "Chrome";
    else if (/Firefox/.test(ua)) browser = "Firefox";
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
    else if (/Edg/.test(ua)) browser = "Edge";
    else if (/Opera|OPR/.test(ua)) browser = "Opera";
    
    return {
        deviceId,
        deviceName,
        deviceType,
        os,
        browser,
        userAgent: ua,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
}

// ===== XÓA HOÀN TOÀN DỮ LIỆU ĐĂNG NHẬP =====
function clearAllAuthData() {
    console.log('🗑️ Đang xóa toàn bộ dữ liệu đăng nhập...');
    
    // Xóa tất cả localStorage
    localStorage.removeItem('viechat_current_session');
    localStorage.removeItem('viechat_device_id');
    localStorage.removeItem('viechat_userId');
    localStorage.removeItem('viechat_remote_logout');
    
    // Xóa sessionStorage
    sessionStorage.clear();
    
    // Xóa cookies (nếu có)
    document.cookie.split(";").forEach(function(c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    // Xóa IndexedDB (nếu có)
    if (window.indexedDB) {
        indexedDB.databases().then((dbs) => {
            dbs.forEach((db) => {
                if (db.name) {
                    indexedDB.deleteDatabase(db.name);
                }
            });
        }).catch(() => {});
    }
    
    // Xóa Cache Storage (nếu có)
    if (window.caches) {
        caches.keys().then((keys) => {
            keys.forEach((key) => {
                caches.delete(key);
            });
        }).catch(() => {});
    }
    
    console.log('✅ Đã xóa toàn bộ dữ liệu đăng nhập');
}

// ===== THIẾT LẬP SESSION LISTENER =====
function setupSessionListener(uid, sessionId) {
    try {
        // Xóa listener cũ nếu có
        if (sessionListenerRef) {
            if (typeof sessionListenerRef === 'function') {
                sessionListenerRef();
            }
            sessionListenerRef = null;
        }
        
        if (!uid || !sessionId) return;
        
        const sessionRef = ref(db, `users/${uid}/sessions/${sessionId}`);
        sessionListenerRef = onValue(sessionRef, (snap) => {
            // Nếu đang đăng xuất chủ động, bỏ qua
            if (isLoggingOut) {
                console.log('ℹ️ Đang đăng xuất chủ động, bỏ qua kiểm tra session');
                return;
            }
            
            // Kiểm tra flag remote logout
            if (localStorage.getItem('viechat_remote_logout') === 'true') {
                console.log('ℹ️ Đã có flag remote logout, bỏ qua');
                return;
            }
            
            if (!snap.exists()) {
                console.log('🔴 Session không tồn tại, hiển thị remote logout');
                showRemoteLogoutModal();
                return;
            }
            
            const data = snap.val();
            
            // KIỂM TRA: Nếu đang xóa tài khoản, bỏ qua
            if (data.isDeletingAccount === true) {
                console.log('ℹ️ Đang xóa tài khoản, bỏ qua hiển thị remote logout');
                return;
            }
            
            // Chỉ hiển thị modal nếu không phải đăng xuất chủ động
            if (data.isActive === false && data.logoutByUser !== true) {
                console.log('🔴 Session bị vô hiệu hóa, hiển thị remote logout');
                showRemoteLogoutModal();
            }
        });
        
        console.log('✅ Đã thiết lập session listener cho:', sessionId);
    } catch (error) {
        console.warn('Lỗi thiết lập session listener:', error);
    }
}

// ===== LƯU THÔNG TIN THIẾT BỊ KHI ĐĂNG NHẬP =====
async function saveDeviceSession(user) {
    if (!user) return;
    
    try {
        const deviceInfo = getDeviceInfo();
        const sessionId = generateSessionId();
        const ipAddress = await getIPAddress();
        
        const sessionsRef = ref(db, `users/${user.uid}/sessions`);
        const snap = await get(sessionsRef);
        let sessions = snap.val() || {};
        
        // Lấy vị trí từ IP
        const location = await getLocationFromIP(ipAddress);
        
        // Kiểm tra thiết bị đã tồn tại chưa (dựa trên deviceId)
        let existingSessionId = null;
        for (const [key, value] of Object.entries(sessions)) {
            if (value.deviceId === deviceInfo.deviceId) {
                existingSessionId = key;
                break;
            }
        }
        
        if (existingSessionId) {
            // Cập nhật phiên cũ
            await update(ref(db, `users/${user.uid}/sessions/${existingSessionId}`), {
                lastActivity: Date.now(),
                isActive: true,
                isCurrentDevice: true,
                userAgent: navigator.userAgent,
                ipAddress: ipAddress,
                location: location
            });
            
            // Đánh dấu các session khác là không phải thiết bị hiện tại
            for (const [key, value] of Object.entries(sessions)) {
                if (key !== existingSessionId && value.isCurrentDevice === true) {
                    await update(ref(db, `users/${user.uid}/sessions/${key}`), {
                        isCurrentDevice: false
                    }).catch(() => {});
                }
            }
            
            localStorage.setItem('viechat_current_session', existingSessionId);
            console.log('✅ Đã cập nhật phiên thiết bị:', deviceInfo.deviceName);
            
            setupSessionListener(user.uid, existingSessionId);
            return existingSessionId;
        }
        
        // Tạo session mới
        const sessionData = {
            sessionId: sessionId,
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName,
            deviceType: deviceInfo.deviceType,
            os: deviceInfo.os,
            browser: deviceInfo.browser,
            userAgent: navigator.userAgent,
            ipAddress: ipAddress,
            location: location,
            loginTime: Date.now(),
            lastActivity: Date.now(),
            isActive: true,
            isCurrentDevice: true
        };
        
        await set(ref(db, `users/${user.uid}/sessions/${sessionId}`), sessionData);
        
        // Đánh dấu các session khác là không phải thiết bị hiện tại
        for (const [key, value] of Object.entries(sessions)) {
            if (value.isCurrentDevice === true) {
                await update(ref(db, `users/${user.uid}/sessions/${key}`), {
                    isCurrentDevice: false
                }).catch(() => {});
            }
        }
        
        localStorage.setItem('viechat_current_session', sessionId);
        
        console.log('✅ Đã lưu phiên thiết bị mới:', deviceInfo.deviceName);
        
        setupSessionListener(user.uid, sessionId);
        
        return sessionId;
    } catch (error) {
        console.error('❌ Lỗi lưu session:', error);
    }
}

// ===== LẤY THÔNG TIN VỊ TRÍ TỪ IP =====
async function getLocationFromIP(ip) {
    if (!ip || ip === 'Không xác định') {
        return { city: 'Không xác định', country: 'Không xác định', flag: '🌍' };
    }
    
    try {
        // Sử dụng API ipapi.co để lấy thông tin vị trí
        const response = await fetch(`https://ipapi.co/${ip}/json/`);
        const data = await response.json();
        
        if (data.error) {
            console.warn('Không thể lấy vị trí từ IP:', data.reason);
            return { city: 'Không xác định', country: 'Không xác định', flag: '🌍' };
        }
        
        return {
            city: data.city || 'Không xác định',
            country: data.country_name || 'Không xác định',
            countryCode: data.country_code || '',
            flag: getCountryFlag(data.country_code),
            region: data.region || '',
            timezone: data.timezone || ''
        };
    } catch (error) {
        console.warn('Lỗi lấy vị trí từ IP:', error);
        return { city: 'Không xác định', country: 'Không xác định', flag: '🌍' };
    }
}

// ===== LẤY CỜ QUỐC GIA =====
function getCountryFlag(countryCode) {
    if (!countryCode) return '🌍';
    
    // Chuyển đổi mã quốc gia thành emoji flag
    const codePoints = countryCode.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// ===== LƯU VỊ TRÍ VÀO SESSION KHI ĐĂNG NHẬP =====
async function saveDeviceLocation(sessionId, ip) {
    if (!currentUser || !sessionId) return;
    
    try {
        const location = await getLocationFromIP(ip);
        const sessionRef = ref(db, `users/${currentUser.uid}/sessions/${sessionId}`);
        await update(sessionRef, {
            location: location
        });
        console.log('✅ Đã lưu vị trí thiết bị:', location.city, location.country);
    } catch (error) {
        console.warn('Không thể lưu vị trí:', error);
    }
}

// ===== HIỂN THỊ DANH SÁCH THIẾT BỊ =====
async function renderDeviceList() {
    const container = document.getElementById('deviceListContainer');
    if (!container) return;
    
    if (!currentUser) {
        container.innerHTML = `<div class="alert alert-warning">Vui lòng đăng nhập để xem danh sách thiết bị.</div>`;
        return;
    }
    
    try {
        const sessionsRef = ref(db, `users/${currentUser.uid}/sessions`);
        const snap = await get(sessionsRef);
        
        if (!snap.exists()) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-laptop" style="font-size: 48px; opacity: 0.3;"></i>
                    <p class="mt-2">Chưa có thiết bị nào đăng nhập.</p>
                    <p class="text-muted small">Hãy đăng nhập trên thiết bị khác để hiển thị tại đây.</p>
                </div>
            `;
            return;
        }
        
        const sessions = snap.val();
        const currentSessionId = localStorage.getItem('viechat_current_session');
        
        const sessionArray = Object.entries(sessions).map(([id, data]) => ({
            id,
            ...data,
            loginTime: data.loginTime || 0,
            lastActivity: data.lastActivity || 0,
            isCurrentDevice: id === currentSessionId
        }));
        
        // Sắp xếp: phiên hiện tại lên đầu
        sessionArray.sort((a, b) => {
            if (a.isCurrentDevice) return -1;
            if (b.isCurrentDevice) return 1;
            return (b.loginTime || 0) - (a.loginTime || 0);
        });
        
        let html = `<div class="device-list">`;
        
        sessionArray.forEach((session) => {
            const isActive = session.isActive !== false;
            const isCurrent = session.isCurrentDevice === true;
            const loginDate = new Date(session.loginTime);
            
            const now = Date.now();
            const loginDuration = now - session.loginTime;
            const days = Math.floor(loginDuration / (24 * 60 * 60 * 1000));
            const hours = Math.floor((loginDuration % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((loginDuration % (60 * 60 * 1000)) / (60 * 1000));
            
            let timeText = '';
            if (days > 0) {
                timeText = `${days} ngày ${hours} giờ`;
            } else if (hours > 0) {
                timeText = `${hours} giờ ${minutes} phút`;
            } else {
                timeText = `${minutes} phút`;
            }
            
            const inactiveDuration = now - (session.lastActivity || session.loginTime);
            const inactiveDays = Math.floor(inactiveDuration / (24 * 60 * 60 * 1000));
            const inactiveHours = Math.floor((inactiveDuration % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            
            let inactiveText = '';
            if (!isActive) {
                inactiveText = '🔴 Đã đăng xuất';
            } else if (inactiveDays > 0) {
                inactiveText = `🟡 Không hoạt động ${inactiveDays} ngày`;
            } else if (inactiveHours > 0) {
                inactiveText = `🟡 Không hoạt động ${inactiveHours} giờ`;
            } else {
                inactiveText = '🟢 Đang hoạt động';
            }
            
            const deviceIcon = session.deviceType === 'mobile' ? '📱' : 
                              session.deviceType === 'tablet' ? '📟' : '💻';
            
            const statusColor = isActive ? '#42b72a' : '#dc3545';
            const statusText = isActive ? '🟢 Hoạt động' : '🔴 Đã đăng xuất';
            
            const loginTimeStr = loginDate.toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const cardClass = isCurrent ? 'device-card current-device' : 'device-card';
            
            // Lấy thông tin vị trí
            const location = session.location || {};
            const locationText = location.city && location.country ? 
                `${location.flag || '🌍'} ${location.city}, ${location.country}` : 
                '📍 Không xác định';
            
            html += `
                <div class="${cardClass}">
                    <div class="device-header">
                        <div class="device-icon-large">${deviceIcon}</div>
                        <div class="device-main-info">
                            <div class="device-name">
                                ${session.deviceName || 'Thiết bị không xác định'}
                                ${isCurrent ? '<span class="badge-current">● Thiết bị này</span>' : ''}
                            </div>
                            <div class="device-os-browser">${session.os || 'Unknown'} • ${session.browser || 'Unknown'}</div>
                        </div>
                        <div class="device-status">
                            <span class="status-dot" style="background: ${statusColor};"></span>
                            <span class="status-text">${statusText}</span>
                        </div>
                    </div>
                    
                    <div class="device-details">
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-sign-in-alt"></i> Đăng nhập:</span>
                            <span class="detail-value">${loginTimeStr}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-clock"></i> Thời gian:</span>
                            <span class="detail-value">${timeText}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-activity"></i> Trạng thái:</span>
                            <span class="detail-value">${inactiveText}</span>
                        </div>
                        ${session.ipAddress ? `
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-network-wired"></i> IP:</span>
                            <span class="detail-value">${session.ipAddress}</span>
                        </div>
                        ` : ''}
                        <div class="detail-row">
                            <span class="detail-label"><i class="fas fa-map-marker-alt"></i> Vị trí:</span>
                            <span class="detail-value">${locationText}</span>
                        </div>
                    </div>
                    
                    ${!isCurrent && isActive ? `
                    <div class="device-actions">
                        <button class="btn btn-danger btn-sm" onclick="logoutDeviceSession('${session.id}')">
                            <i class="fas fa-sign-out-alt"></i> Đăng xuất từ xa
                        </button>
                    </div>
                    ` : ''}
                    
                    ${isCurrent ? `
                    <div class="device-actions">
                        <span class="text-muted small"><i class="fas fa-info-circle"></i> Đây là thiết bị bạn đang sử dụng</span>
                    </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += `</div>`;
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Lỗi hiển thị danh sách thiết bị:', error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-1"></i>
                Không thể tải danh sách thiết bị. Vui lòng thử lại.
                <br>
                <button class="btn btn-sm btn-outline-danger mt-2" onclick="renderDeviceList()">
                    <i class="fas fa-sync"></i> Thử lại
                </button>
            </div>
        `;
    }
}

// ===== CẬP NHẬT VỊ TRÍ CHO CÁC SESSION CŨ =====
async function updateLocationsForExistingSessions() {
    if (!currentUser) return;
    
    try {
        const sessionsRef = ref(db, `users/${currentUser.uid}/sessions`);
        const snap = await get(sessionsRef);
        
        if (!snap.exists()) return;
        
        const sessions = snap.val();
        
        for (const [id, data] of Object.entries(sessions)) {
            // Nếu đã có location thì bỏ qua
            if (data.location && data.location.city) continue;
            
            if (data.ipAddress && data.ipAddress !== 'Không xác định') {
                const location = await getLocationFromIP(data.ipAddress);
                await update(ref(db, `users/${currentUser.uid}/sessions/${id}`), {
                    location: location
                });
                console.log(`✅ Đã cập nhật vị trí cho session ${id}`);
            }
        }
    } catch (error) {
        console.warn('Lỗi cập nhật vị trí cho session cũ:', error);
    }
}

// ===== ĐĂNG XUẤT TỪ XA MỘT THIẾT BỊ =====
window.logoutDeviceSession = async function(sessionId) {
    if (!sessionId) {
        showToast('Lỗi', 'Không tìm thấy session ID.', 'error');
        return;
    }
    
    // Không đánh dấu isLoggingOut vì đây là đăng xuất từ xa, không phải chủ động
    showConfirm(
        `<div class="text-center">
            <i class="fas fa-sign-out-alt" style="font-size: 48px; color: var(--warning); display: block; margin-bottom: 15px;"></i>
            <p><strong>Bạn có chắc chắn muốn đăng xuất thiết bị này?</strong></p>
            <p class="text-muted small">Thiết bị sẽ bị đăng xuất ngay lập tức và cần đăng nhập lại để sử dụng.</p>
        </div>`,
        async () => {
            try {
                const sessionRef = ref(db, `users/${currentUser.uid}/sessions/${sessionId}`);
                await update(sessionRef, {
                    isActive: false,
                    logoutTime: Date.now(),
                    logoutBy: 'remote' // Đánh dấu là đăng xuất từ xa
                });
                
                showToast('Thành công', 'Đã đăng xuất thiết bị từ xa!', 'success');
                
                // Refresh danh sách thiết bị
                setTimeout(() => renderDeviceList(), 500);
                
            } catch (error) {
                console.error('Lỗi đăng xuất từ xa:', error);
                showToast('Lỗi', 'Không thể đăng xuất thiết bị. Vui lòng thử lại.', 'error');
            }
        }
    );
};

// ===== KIỂM TRA VÀ XÓA PHIÊN CŨ =====
async function cleanupInactiveSessions() {
    if (!currentUser) return;
    
    try {
        const sessionsRef = ref(db, `users/${currentUser.uid}/sessions`);
        const snap = await get(sessionsRef);
        
        if (!snap.exists()) return;
        
        const sessions = snap.val();
        const now = Date.now();
        const maxInactiveDays = 30;
        
        for (const [id, data] of Object.entries(sessions)) {
            if (data.isCurrentDevice) continue;
            
            const lastActive = data.lastActivity || data.loginTime || 0;
            const inactiveDays = (now - lastActive) / (24 * 60 * 60 * 1000);
            
            if (inactiveDays > maxInactiveDays) {
                await remove(ref(db, `users/${currentUser.uid}/sessions/${id}`));
                console.log(`🗑️ Đã xóa phiên cũ: ${id}`);
            }
        }
    } catch (error) {
        console.error('Lỗi cleanup sessions:', error);
    }
}

// ===== HIỂN THỊ MODAL BỊ ĐĂNG XUẤT TỪ XA =====
function showRemoteLogoutModal() {
    // Nếu đang đăng xuất chủ động, không hiển thị modal
    if (isLoggingOut) {
        console.log('ℹ️ Đang đăng xuất chủ động, bỏ qua hiển thị modal');
        return;
    }
    
    // Xóa toàn bộ dữ liệu đăng nhập
    clearAllAuthData();
    
    // Đánh dấu đã đăng xuất từ xa
    localStorage.setItem('viechat_remote_logout', 'true');
    
    // Đánh dấu đang đăng xuất
    isLoggingOut = true;
    
    // Hủy tất cả listeners
    if (sessionListenerRef) {
        try {
            if (typeof sessionListenerRef === 'function') {
                sessionListenerRef();
            }
        } catch (error) {
            console.warn('Lỗi khi hủy session listener:', error);
        }
        sessionListenerRef = null;
    }
    
    if (sessionsListenerRef) {
        try {
            off(sessionsListenerRef);
        } catch (error) {
            console.warn('Lỗi khi hủy sessions listener:', error);
        }
        sessionsListenerRef = null;
    }
    
    const modalHtml = `
        <div class="modal fade" id="remoteLogoutModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title fw-bold">
                            <i class="fas fa-exclamation-triangle me-2"></i>Đã đăng xuất từ xa
                        </h5>
                    </div>
                    <div class="modal-body text-center py-4">
                        <i class="fas fa-shield-alt" style="font-size: 64px; color: var(--danger); display: block; margin-bottom: 20px;"></i>
                        <h5 class="fw-bold">Tài khoản của bạn đã bị đăng xuất từ xa</h5>
                        <p class="text-muted mt-2">Một thiết bị khác đã yêu cầu đăng xuất khỏi thiết bị này.</p>
                        <div class="alert alert-warning mt-3">
                            <i class="fas fa-info-circle me-1"></i>
                            Vui lòng đăng nhập lại để tiếp tục sử dụng.
                        </div>
                    </div>
                    <div class="modal-footer justify-content-center">
                        <button class="btn btn-primary px-4" onclick="handleRemoteLogout()">
                            Đã hiểu
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Xóa modal cũ nếu có
    const oldModal = document.getElementById('remoteLogoutModal');
    if (oldModal) {
        oldModal.remove();
    }
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modalEl = document.getElementById('remoteLogoutModal');
    const modal = new bootstrap.Modal(modalEl, {
        backdrop: 'static',
        keyboard: false
    });
    modal.show();
}

// ===== XỬ LÝ KHI BỊ ĐĂNG XUẤT TỪ XA =====
window.handleRemoteLogout = function() {
    const modalEl = document.getElementById('remoteLogoutModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        modalEl.remove();
    }
    
    // Xóa toàn bộ dữ liệu
    clearAllAuthData();
    
    // Đăng xuất khỏi Firebase - ĐẢM BẢO XÓA SESSION
    signOut(auth).then(() => {
        console.log('✅ Đã đăng xuất thành công');
    }).catch((error) => {
        console.error('Lỗi đăng xuất:', error);
    });
    
    // Reset flag
    isLoggingOut = false;
    
    // Chuyển về trang đăng nhập - THÊM THAM SỐ ĐỂ CHẶN TỰ ĐỘNG ĐĂNG NHẬP
    setTimeout(() => {
        window.location.href = 'index.html?remote_logout=true&force_logout=' + Date.now();
    }, 300);
};

// ===== LẮNG NGHE THAY ĐỔI SESSION =====
function listenForSessionChanges() {
    if (!currentUser) return;
    
    // Xóa listener cũ nếu có - SỬA LỖI
    if (sessionListenerRef) {
        try {
            // Nếu sessionListenerRef là một hàm unsubscribe (từ onValue)
            if (typeof sessionListenerRef === 'function') {
                sessionListenerRef();
            }
        } catch (error) {
            console.warn('Lỗi khi hủy listener cũ:', error);
        }
        sessionListenerRef = null;
    }
    
    const currentSessionId = localStorage.getItem('viechat_current_session');
    if (!currentSessionId) return;
    
    const sessionRef = ref(db, `users/${currentUser.uid}/sessions/${currentSessionId}`);
    
    // Lưu hàm unsubscribe thay vì tham chiếu listener
    sessionListenerRef = onValue(sessionRef, (snap) => {
        // Nếu đang đăng xuất chủ động hoặc xóa tài khoản, bỏ qua
        if (isLoggingOut) {
            console.log('ℹ️ Đang đăng xuất/xóa tài khoản, bỏ qua');
            return;
        }
        
        if (!snap.exists()) {
            showRemoteLogoutModal();
            return;
        }
        
        const data = snap.val();
        
        // Kiểm tra nếu đang xóa tài khoản
        if (data.isDeletingAccount === true) {
            console.log('ℹ️ Đang xóa tài khoản, bỏ qua');
            return;
        }
        
        if (data.isActive === false && data.logoutByUser !== true) {
            showRemoteLogoutModal();
        }
    });
}

// ===== XÓA SESSION KHI ĐĂNG XUẤT CHỦ ĐỘNG =====
function clearCurrentSession(isDeletingAccount = false) {
    const sessionId = localStorage.getItem('viechat_current_session');
    
    // Đánh dấu đang đăng xuất chủ động
    isLoggingOut = true;
    
    // Xóa listener trước
    if (sessionListenerRef) {
        try {
            if (typeof sessionListenerRef === 'function') {
                sessionListenerRef();
            }
        } catch (error) {
            console.warn('Lỗi khi hủy listener:', error);
        }
        sessionListenerRef = null;
    }
    
    // Xóa sessions listener
    if (sessionsListenerRef) {
        try {
            off(sessionsListenerRef);
        } catch (error) {
            console.warn('Lỗi khi hủy sessions listener:', error);
        }
        sessionsListenerRef = null;
    }
    
    // Cập nhật session thành không hoạt động - đánh dấu là đăng xuất chủ động
    if (sessionId && currentUser) {
        update(ref(db, `users/${currentUser.uid}/sessions/${sessionId}`), {
            isActive: false,
            logoutTime: Date.now(),
            logoutByUser: true, // Đánh dấu là đăng xuất chủ động
            isDeletingAccount: isDeletingAccount // Đánh dấu đang xóa tài khoản
        }).catch((error) => {
            console.warn('Không thể cập nhật session khi đăng xuất:', error);
        });
    }
    
    localStorage.removeItem('viechat_current_session');
    
    // Reset flag sau 3 giây (tăng thời gian để đảm bảo)
    setTimeout(() => {
        isLoggingOut = false;
    }, 3000);
}

// =====================================================
// ===== KẾT THÚC PHẦN SESSION MANAGEMENT =====
// =====================================================

// ===== XỬ LÝ THAM SỐ URL KHI MỞ CHAT =====
function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    const name = params.get('name');
    
    if (uid && currentUser) {
        console.log('🔍 Xử lý tham số URL:', { uid, name });
        
        get(ref(db, `users/${uid}`)).then((snap) => {
            if (snap.exists()) {
                const userData = snap.val();
                const displayName = name ? decodeURIComponent(name) : userData.name || 'Người dùng';
                
                get(ref(db, `friend_status/${currentUser.uid}/${uid}`)).then((statusSnap) => {
                    const status = statusSnap.val();
                    
                    if (!status) {
                        const chatId = currentUser.uid < uid ? `${currentUser.uid}_${uid}` : `${uid}_${currentUser.uid}`;
                        get(ref(db, `messages/${chatId}`)).then((msgSnap) => {
                            if (msgSnap.exists()) {
                                set(ref(db, `friend_status/${currentUser.uid}/${uid}`), 'stranger').catch(() => {});
                            }
                        });
                    }
                });
                
                setTimeout(() => {
                    const existingItem = document.getElementById(`item-${uid}`);
                    if (existingItem) {
                        existingItem.click();
                    } else {
                        openChatFunction(uid, displayName, null);
                    }
                }, 500);
            } else {
                showToast('Lỗi', 'Không tìm thấy người dùng này.', 'error');
            }
        }).catch((err) => {
            console.error('Lỗi lấy thông tin user từ URL:', err);
            showToast('Lỗi', 'Không thể tải thông tin người dùng.', 'error');
        });
        
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ===== TOAST SYSTEM =====
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
    
    return toast;
}

// ===== TOGGLE PASSWORD =====
window.togglePassword = (inputId, button) => {
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
        color = '#42b72a';
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

function updatePasswordStrengthUI(password, fillId, labelId, reqPrefix) {
    const fill = document.getElementById(fillId);
    const label = document.getElementById(labelId);
    const result = checkPasswordStrength(password);
    
    fill.style.width = result.width + '%';
    fill.style.backgroundColor = result.color;
    label.textContent = result.label;
    label.style.color = result.color;
    
    const reqMap = {
        length: document.getElementById(`${reqPrefix}ReqLength`),
        uppercase: document.getElementById(`${reqPrefix}ReqUppercase`),
        lowercase: document.getElementById(`${reqPrefix}ReqLowercase`),
        digit: document.getElementById(`${reqPrefix}ReqDigit`),
        special: document.getElementById(`${reqPrefix}ReqSpecial`)
    };
    
    Object.keys(reqMap).forEach(key => {
        const el = reqMap[key];
        if (el) {
            const met = result.checks[key];
            el.className = `req-item ${met ? 'met' : 'unmet'}`;
            el.querySelector('.req-icon').innerHTML = met ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-circle"></i>';
        }
    });
    
    return result;
}

// ===== SHOW ABOUT MODAL =====
window.showAboutModal = () => {
    const modalEl = document.getElementById('aboutModal');
    aboutModalObj = new bootstrap.Modal(modalEl);
    aboutModalObj.show();
};

// ===== OPEN CHAT INFO MODAL =====
window.openChatInfoModal = () => {
    if (!activeChatId || !currentChatUid) return;
    openUserInfoModal(currentChatUid);
};

// ===== CONTEXT MENU FUNCTIONS =====
function showContextMenuFromDots(e, msgId, sender, text, file, senderName, isOwn) {
    e.preventDefault();
    e.stopPropagation();
    
    selectedMsgId = msgId;
    selectedMsgSender = sender;
    selectedMsgText = text || '';
    selectedMsgFile = file || null;
    selectedMsgSenderName = senderName || 'Người dùng';
    selectedMsgIsOwn = isOwn;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left;
    const y = rect.bottom + 5;
    
    if (isMobile) {
        const sheet = document.getElementById('bottomSheet');
        const replyBtn = document.getElementById('sheet-reply');
        const revokeBtn = document.getElementById('sheet-revoke');
        const deleteBtn = document.getElementById('sheet-delete-for-me');
        
        replyBtn.style.display = 'flex';
        revokeBtn.style.display = isOwn ? 'flex' : 'none';
        deleteBtn.textContent = isOwn ? 'Xóa' : 'Xóa phía tôi';
        
        replyBtn.onclick = () => { closeContextMenu(); window.replyToMessage(selectedMsgId, selectedMsgSender, selectedMsgText, selectedMsgFile, selectedMsgSenderName); };
        revokeBtn.onclick = () => { closeContextMenu(); window.revokeMsg(selectedMsgId); };
        deleteBtn.onclick = () => { closeContextMenu(); window.deleteMsg(selectedMsgId, isOwn); };
        
        document.getElementById('contextOverlay').style.display = 'block';
        sheet.style.display = 'block';
        sheet.style.transform = 'translateY(0)';
    } else {
        const menu = document.getElementById('contextMenu');
        const replyBtn = document.getElementById('menu-reply');
        const revokeBtn = document.getElementById('menu-revoke');
        const deleteBtn = document.getElementById('menu-delete-for-me');
        
        replyBtn.style.display = 'flex';
        revokeBtn.style.display = isOwn ? 'flex' : 'none';
        deleteBtn.textContent = isOwn ? 'Xóa' : 'Xóa phía tôi';
        
        replyBtn.onclick = () => { closeContextMenu(); window.replyToMessage(selectedMsgId, selectedMsgSender, selectedMsgText, selectedMsgFile, selectedMsgSenderName); };
        revokeBtn.onclick = () => { closeContextMenu(); window.revokeMsg(selectedMsgId); };
        deleteBtn.onclick = () => { closeContextMenu(); window.deleteMsg(selectedMsgId, isOwn); };
        
        let menuX = x;
        let menuY = y;
        const menuWidth = 220;
        const menuHeight = 160;
        
        if (menuX + menuWidth > window.innerWidth) menuX = window.innerWidth - menuWidth - 10;
        if (menuY + menuHeight > window.innerHeight) menuY = window.innerHeight - menuHeight - 10;
        if (menuX < 10) menuX = 10;
        if (menuY < 10) menuY = 10;
        
        menu.style.left = menuX + 'px';
        menu.style.top = menuY + 'px';
        document.getElementById('contextOverlay').style.display = 'block';
        menu.style.display = 'block';
    }
}

window.closeContextMenu = () => {
    document.getElementById('contextMenu').style.display = 'none';
    document.getElementById('bottomSheet').style.display = 'none';
    document.getElementById('contextOverlay').style.display = 'none';
};

// ===== AGE CHECK FUNCTIONS =====
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

function isUnderAge(birthday) {
    return checkAge(birthday) < 12;
}

function showAgeWarning() {
    if (ageWarningShown) return;
    ageWarningShown = true;
    
    const modalEl = document.getElementById('ageWarningModal');
    ageWarningModalObj = new bootstrap.Modal(modalEl, {
        backdrop: 'static',
        keyboard: false
    });
    ageWarningModalObj.show();
}

window.closeAgeWarningAndOpenPrivacy = () => {
    if (ageWarningModalObj) {
        ageWarningModalObj.hide();
        ageWarningModalObj = null;
    }
    setTimeout(() => {
        showPrivacyModal();
    }, 300);
};

// ===== TAB SWITCHING =====
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
};

function updateBadgeCounts(counts) {
    if (counts.incoming !== undefined) {
        document.getElementById('incoming-badge').textContent = counts.incoming;
        document.getElementById('incoming-badge').style.display = counts.incoming > 0 ? 'inline' : 'none';
    }
    if (counts.outgoing !== undefined) {
        document.getElementById('outgoing-badge').textContent = counts.outgoing;
        document.getElementById('outgoing-badge').style.display = counts.outgoing > 0 ? 'inline' : 'none';
    }
    if (counts.friends !== undefined) {
        document.getElementById('friends-badge').textContent = counts.friends;
        document.getElementById('friends-badge').style.display = counts.friends > 0 ? 'inline' : 'none';
    }
    if (counts.strangers !== undefined) {
        document.getElementById('strangers-badge').textContent = counts.strangers;
        document.getElementById('strangers-badge').style.display = counts.strangers > 0 ? 'inline' : 'none';
    }
}

// ===== AVATAR FUNCTIONS =====
function updateAvatarUI(avatarData) {
    const img = document.getElementById('my-avatar-img');
    const placeholder = document.getElementById('my-avatar-placeholder');
    
    if (avatarData && avatarData.startsWith('data:image')) {
        img.src = avatarData;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        const name = document.getElementById('my-name').innerText.replace(/<[^>]*>/g, '') || 'U';
        placeholder.textContent = name.charAt(0).toUpperCase();
        placeholder.style.display = 'flex';
    }
    
    const modalImg = document.getElementById('modalUserAvatar');
    const modalPlaceholder = document.getElementById('modalUserAvatarPlaceholder');
    if (avatarData && avatarData.startsWith('data:image')) {
        modalImg.src = avatarData;
        modalImg.style.display = 'block';
        modalPlaceholder.style.display = 'none';
    } else {
        modalImg.style.display = 'none';
        const name = document.getElementById('my-name').innerText.replace(/<[^>]*>/g, '') || 'U';
        modalPlaceholder.textContent = name.charAt(0).toUpperCase();
        modalPlaceholder.style.display = 'flex';
    }
}

function getAvatarDataFromUser(userData) {
    if (userData && userData.avatar && userData.avatar.startsWith('data:image')) {
        return userData.avatar;
    }
    return null;
}

function renderUserAvatar(uid, userData, size = 36) {
    let avatar = getAvatarDataFromUser(userData);
    const name = userData?.name || 'Người dùng';
    
    if (!avatar && uid === currentUser?.uid && currentUser?.photoURL) {
        avatar = currentUser.photoURL;
    }
    
    if (avatar && (avatar.startsWith('data:image') || avatar.startsWith('http'))) {
        return `<img src="${avatar}" class="msg-avatar" style="width:${size}px; height:${size}px;" onclick="event.stopPropagation(); openUserInfoModal('${uid}')" title="${escapeHtml(name)}" loading="lazy">`;
    } else {
        return `<div class="msg-avatar-placeholder" style="width:${size}px; height:${size}px; font-size:${size/2}px;" onclick="event.stopPropagation(); openUserInfoModal('${uid}')" title="${escapeHtml(name)}">${name.charAt(0).toUpperCase()}</div>`;
    }
}

// ===== AVATAR UPLOAD MODAL =====
window.openAvatarUploadModal = () => {
    avatarFileData = null;
    document.getElementById('avatarFileInput').value = '';
    document.getElementById('saveAvatarBtn').style.display = 'inline-block';
    
    const img = document.getElementById('avatarUploadPreview');
    const placeholder = document.getElementById('avatarUploadPlaceholder');
    const currentAvatar = document.getElementById('my-avatar-img').src;
    const currentName = document.getElementById('my-name').innerText.replace(/<[^>]*>/g, '');
    
    if (currentAvatar && currentAvatar.startsWith('data:image') && currentAvatar !== window.location.href) {
        img.src = currentAvatar;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.textContent = currentName.charAt(0).toUpperCase() || 'U';
        placeholder.style.display = 'flex';
    }
    
    const modalEl = document.getElementById('avatarUploadModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
};

window.handleAvatarSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
        showToast("Lỗi", "Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 2MB.", "error");
        event.target.value = '';
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        showToast("Lỗi", "Vui lòng chọn file ảnh.", "error");
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        avatarFileData = e.target.result;
        const img = document.getElementById('avatarUploadPreview');
        const placeholder = document.getElementById('avatarUploadPlaceholder');
        img.src = avatarFileData;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
};

window.saveAvatar = async () => {
    if (!avatarFileData) {
        showToast("Lỗi", "Vui lòng chọn ảnh trước khi lưu.", "error");
        return;
    }
    
    try {
        await update(ref(db, `users/${currentUser.uid}`), { avatar: avatarFileData });
        updateAvatarUI(avatarFileData);
        const modalEl = document.getElementById('avatarUploadModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        showToast("Thành công", "Đã cập nhật ảnh đại diện thành công!", "success");
    } catch (error) {
        console.error('Lỗi lưu avatar:', error);
        showToast("Lỗi", "Không thể lưu ảnh đại diện. Vui lòng thử lại.", "error");
    }
};

window.deleteAvatar = async () => {
    showConfirm("Bạn có chắc chắn muốn xóa ảnh đại diện?", async () => {
        try {
            await update(ref(db, `users/${currentUser.uid}`), { avatar: null });
            updateAvatarUI(null);
            const img = document.getElementById('avatarUploadPreview');
            const placeholder = document.getElementById('avatarUploadPlaceholder');
            const currentName = document.getElementById('my-name').innerText.replace(/<[^>]*>/g, '');
            img.style.display = 'none';
            placeholder.textContent = currentName.charAt(0).toUpperCase() || 'U';
            placeholder.style.display = 'flex';
            const modalEl = document.getElementById('avatarUploadModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            showToast("Thành công", "Đã xóa ảnh đại diện thành công!", "success");
        } catch (error) {
            console.error('Lỗi xóa avatar:', error);
            showToast("Lỗi", "Không thể xóa ảnh đại diện. Vui lòng thử lại.", "error");
        }
    });
};

// ===== FILE HANDLING =====
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getFileIconClass(mimeType) {
    if (!mimeType) return 'fa-file';
    if (mimeType.startsWith('image/')) return 'fa-image';
    if (mimeType.startsWith('video/')) return 'fa-video';
    if (mimeType === 'application/pdf') return 'fa-file-pdf';
    if (mimeType.startsWith('audio/')) return 'fa-music';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return 'fa-file-archive';
    return 'fa-file';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function renderSelectedFiles() {
    const container = document.getElementById('filesPreviewContainer');
    if (selectedFiles.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'file-preview-item';
        const icon = getFileIconClass(file.type);
        div.innerHTML = `
            <span class="file-icon"><i class="fas ${icon}"></i></span>
            <span class="file-info" title="${file.name}">${file.name}</span>
            <span style="font-size:10px; color:#888;">${formatFileSize(file.size)}</span>
            <button class="remove-file" onclick="removeFileFromList(${index})" title="Xóa file">✕</button>
        `;
        container.appendChild(div);
    });
}

window.removeFileFromList = (index) => {
    selectedFiles.splice(index, 1);
    selectedFilesData.splice(index, 1);
    renderSelectedFiles();
};

window.clearAllFiles = () => {
    selectedFiles = [];
    selectedFilesData = [];
    renderSelectedFiles();
    document.getElementById('fileInput').value = '';
};

window.handleFileSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    let totalSize = 0;
    for (let i = 0; i < files.length; i++) {
        totalSize += files[i].size;
    }
    
    if (totalSize > 10 * 1024 * 1024) {
        showToast("Lỗi", "Tổng dung lượng các file quá lớn (tối đa 10MB).", "error");
        event.target.value = '';
        return;
    }
    
    if (selectedFiles.length + files.length > 10) {
        showToast("Lỗi", "Chỉ được gửi tối đa 10 file cùng lúc.", "error");
        event.target.value = '';
        return;
    }
    
    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > 2 * 1024 * 1024) {
                showToast("Lỗi", `File "${file.name}" quá lớn (tối đa 2MB).`, "error");
                event.target.value = '';
                return;
            }
            
            const base64Data = await fileToBase64(file);
            selectedFiles.push(file);
            selectedFilesData.push(base64Data);
        }
        
        renderSelectedFiles();
        document.getElementById('fileInput').value = '';
        
    } catch (error) {
        console.error('Lỗi đọc file:', error);
        showToast("Lỗi", "Không thể đọc file. Vui lòng thử lại.", "error");
        event.target.value = '';
    }
};

// ===== RENDER FUNCTIONS =====
function renderFileMessage(fileData) {
    const isImage = fileData.type && fileData.type.startsWith('image/');
    const isVideo = fileData.type && fileData.type.startsWith('video/');
    const size = formatFileSize(fileData.size);
    const dataUrl = fileData.data;
    
    if (isImage) {
        return `<img src="${dataUrl}" alt="${fileData.name}" loading="lazy" style="max-width:250px; max-height:250px; border-radius:8px; display:block; margin:4px 0;">
                <div style="font-size:12px; color:#666; margin-top:2px;">📎 ${fileData.name}</div>`;
    } else if (isVideo) {
        return `<video controls src="${dataUrl}" style="max-width:250px; max-height:250px; border-radius:8px; display:block; margin:4px 0;"></video>
                <div style="font-size:12px; color:#666; margin-top:2px;">📎 ${fileData.name}</div>`;
    } else {
        return `<a href="${dataUrl}" download="${fileData.name}" class="file-attachment" style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:rgba(0,0,0,0.05); border-radius:8px; text-decoration:none; color:inherit; cursor:pointer;">
            <i class="fas ${getFileIconClass(fileData.type)}" style="font-size:28px; color:var(--primary);"></i>
            <div style="flex:1; min-width:0;">
                <div style="font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${fileData.name}</div>
                <div style="font-size:11px; color:#888;">${size}</div>
            </div>
            <i class="fas fa-download" style="color:#888;"></i>
        </a>`;
    }
}

// ===== REPLY FUNCTIONS =====
window.replyToMessage = (msgId, sender, text, file, senderName) => {
    replyToMessage = {
        id: msgId,
        sender: sender,
        text: text || '',
        file: file || null,
        name: senderName || 'Người dùng'
    };
    
    const preview = document.getElementById('replyPreview');
    document.getElementById('replySender').textContent = `Đang trả lời ${replyToMessage.name}:`;
    document.getElementById('replyText').textContent = text || (file ? `[${file.name}]` : 'Tin nhắn không có nội dung');
    preview.style.display = 'flex';
    
    document.getElementById('message-input').focus();
};

window.cancelReply = () => {
    replyToMessage = null;
    document.getElementById('replyPreview').style.display = 'none';
};

function renderRepliedMessage(replyData, senderName) {
    if (!replyData) return '';
    const content = replyData.text ? replyData.text.substring(0, 50) + (replyData.text.length > 50 ? '...' : '') : 
                   (replyData.file ? `[${replyData.file.name}]` : 'Tin nhắn không có nội dung');
    return `
        <div class="replied-msg">
            <div class="reply-sender">${escapeHtml(senderName || 'Người dùng')}</div>
            <div class="reply-text">${escapeHtml(content)}</div>
        </div>
    `;
}

// ===== USER INFO MODAL =====
window.openUserInfoModal = async (uid) => {
    if (!uid) return;
    
    try {
        const snap = await get(ref(db, `users/${uid}`));
        if (!snap.exists()) {
            showToast("Lỗi", "Không thể tải thông tin người dùng.", "error");
            return;
        }
        const targetData = snap.val();
        
        let avatar = getAvatarDataFromUser(targetData);
        
        if (!avatar && uid === currentUser?.uid && currentUser?.photoURL) {
            try {
                const response = await fetch(currentUser.photoURL);
                const blob = await response.blob();
                const reader = new FileReader();
                avatar = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                if (avatar) {
                    await update(ref(db, `users/${uid}`), { avatar: avatar });
                }
            } catch (e) {
                console.warn('Không thể tải avatar từ social:', e);
                avatar = null;
            }
        }
        
        const modalAvatar = document.getElementById('modalUserAvatar');
        const modalPlaceholder = document.getElementById('modalUserAvatarPlaceholder');
        
        if (avatar && (avatar.startsWith('data:image') || avatar.startsWith('http'))) {
            modalAvatar.src = avatar;
            modalAvatar.style.display = 'block';
            modalPlaceholder.style.display = 'none';
        } else {
            modalAvatar.style.display = 'none';
            const placeholder = document.getElementById('modalUserAvatarPlaceholder');
            placeholder.textContent = (targetData.name || 'U').charAt(0).toUpperCase();
            placeholder.style.display = 'flex';
        }
        
        let nameHtml = escapeHtml(targetData.name || "Người dùng");
        if (targetData.haveGreenTick === true) {
            nameHtml += ` <i class="fas fa-check-circle verified-icon" style="color: #1da1f2; font-size: 16px;" title="Tài khoản đã được xác minh"></i>`;
        }
        document.getElementById('modalUserTxtName').innerHTML = nameHtml;
        document.getElementById('modalUserTxtEmail').innerText = targetData.email || "";
        
        if (targetData.haveGreenTick === true) {
            document.getElementById('modalUserVerifiedBadge').style.display = 'inline-flex';
        } else {
            document.getElementById('modalUserVerifiedBadge').style.display = 'none';
        }
        
        let isHiddenInfo = false;
        if (targetData.showGender !== false) {
            document.getElementById('modalUserTxtGender').innerText = targetData.gender || "Chưa cập nhật";
        } else {
            document.getElementById('modalUserTxtGender').innerText = "••••••••";
            isHiddenInfo = true;
        }
        
        if (targetData.showBirthday !== false) {
            document.getElementById('modalUserTxtBirthday').innerText = targetData.birthday || "Chưa cập nhật";
        } else {
            document.getElementById('modalUserTxtBirthday').innerText = "••/••/••••";
            isHiddenInfo = true;
        }
        document.getElementById('modalUserPrivacyAlert').style.display = isHiddenInfo ? 'block' : 'none';
        
        let status = null;
        let theirStatus = null;
        let targetName = targetData.name || 'Người dùng';
        
        try {
            const statusSnap = await get(ref(db, `friend_status/${currentUser.uid}/${uid}`));
            status = statusSnap.val();
            
            const theirStatusSnap = await get(ref(db, `friend_status/${uid}/${currentUser.uid}`));
            theirStatus = theirStatusSnap.val();
        } catch (e) {
            console.warn('Lỗi lấy trạng thái kết bạn:', e);
        }
        
        let actionAreaHtml = "";
        
        if (uid === currentUser.uid) {
            actionAreaHtml = `<button class="btn btn-secondary px-4" disabled>👤 Đây là bạn</button>`;
        } 
        else if (status === 'blocked' || theirStatus === 'blocked') {
            if (status === 'blocked') {
                actionAreaHtml = `<button class="btn btn-warning" onclick="updateStatus('${uid}','unblock')">🔓 Bỏ chặn</button>`;
            } else {
                actionAreaHtml = `<button class="btn btn-secondary" disabled>🚫 Đã bị chặn</button>`;
            }
        }
        else if (status === "accepted" && theirStatus === "accepted") {
            actionAreaHtml = `
                <button class="btn btn-primary px-4" onclick="directMessageFromModal('${uid}','${targetName.replace(/'/g, "\\'")}')">
                    <i class="fas fa-comment"></i> Nhắn tin ngay
                </button>
                <button class="btn btn-outline-danger" onclick="updateStatus('${uid}','remove')">
                    <i class="fas fa-user-minus"></i> Xóa bạn
                </button>
            `;
        }
        else if (status === "outgoing") {
            actionAreaHtml = `
                <button class="btn btn-secondary" disabled>
                    <i class="fas fa-clock"></i> Đang chờ chấp nhận
                </button>
                <button class="btn btn-danger" onclick="updateStatus('${uid}','cancel')">
                    <i class="fas fa-times"></i> Hủy
                </button>
            `;
        }
        else if (status === "incoming") {
            actionAreaHtml = `
                <button class="btn btn-success" onclick="updateStatus('${uid}','accepted'); closeModalObj();">
                    <i class="fas fa-check"></i> Chấp nhận kết bạn
                </button>
                <button class="btn btn-danger" onclick="updateStatus('${uid}','reject'); closeModalObj();">
                    <i class="fas fa-times"></i> Từ chối
                </button>
            `;
        }
        else {
            if (targetData.allowFriendRequest !== false) {
                actionAreaHtml += `
                    <button class="btn btn-success" onclick="sendFriendRequestFromModal('${uid}')">
                        <i class="fas fa-user-plus"></i> Kết bạn
                    </button>
                `;
            }
            
            let canChat = targetData.allowStrangerChat !== false;
            
            if (!canChat) {
                const chatId = currentUser.uid < uid ? `${currentUser.uid}_${uid}` : `${uid}_${currentUser.uid}`;
                const msgSnap = await get(ref(db, `messages/${chatId}`));
                if (msgSnap.exists()) {
                    const clearSnap = await get(ref(db, `users/${currentUser.uid}/cleared_chats/${chatId}`));
                    const clearTime = clearSnap.val() || 0;
                    let hasValidMsg = false;
                    msgSnap.forEach((m) => {
                        const msg = m.val();
                        if (msg.timestamp > clearTime && !(msg.deletedBy && msg.deletedBy[currentUser.uid])) {
                            hasValidMsg = true;
                        }
                    });
                    if (hasValidMsg) {
                        canChat = true;
                    }
                }
            }
            
            if (canChat) {
                actionAreaHtml += `
                    <button class="btn btn-outline-primary" onclick="directMessageFromModal('${uid}','${targetName.replace(/'/g, "\\'")}')">
                        <i class="fas fa-comment"></i> Nhắn tin ngay
                    </button>
                `;
            }
            
            if (actionAreaHtml) {
                actionAreaHtml += `
                    <button class="btn btn-outline-danger" onclick="updateStatus('${uid}','blocked')">
                        <i class="fas fa-ban"></i> Chặn
                    </button>
                `;
            } else {
                actionAreaHtml = `<button class="btn btn-secondary" disabled>Không thể tương tác</button>`;
            }
        }
        
        document.getElementById('modalUserActionArea').innerHTML = actionAreaHtml;
        
        closeAllModals();
        const modalEl = document.getElementById('userInfoModal');
        setTimeout(() => {
            userInfoModalObj = new bootstrap.Modal(modalEl);
            activeModalInstance = userInfoModalObj;
            modalEl.addEventListener('hidden.bs.modal', function handleHidden() {
                modalEl.removeEventListener('hidden.bs.modal', handleHidden);
                activeModalInstance = null;
                userInfoModalObj = null;
            }, { once: true });
            userInfoModalObj.show();
        }, 150);
        
    } catch (error) {
        console.error('Lỗi mở modal thông tin user:', error);
        showToast("Lỗi", "Không thể tải thông tin. Vui lòng thử lại.", "error");
    }
};

window.closeModalObj = () => { 
    if(userInfoModalObj) {
        userInfoModalObj.hide();
        activeModalInstance = null;
        userInfoModalObj = null;
    }
};

// ===== CLOSE MODAL =====
function closeAllModals() {
    if (activeModalInstance) {
        activeModalInstance.hide();
        activeModalInstance = null;
    }
    const modals = ['searchModal', 'userInfoModal', 'privacySettingsModal', 'logoutConfirmModal', 'commonModal', 'confirmModal', 'ageWarningModal', 'avatarUploadModal', 'aboutModal', 'deleteForMeModal'];
    modals.forEach(modalId => {
        const modalEl = document.getElementById(modalId);
        if (modalEl && modalEl.classList.contains('show')) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
    });
}

// ===== RESET CHAT UI =====
function resetChatUI() {
    ['banned-banner', 'block-banner', 'deleted-banner', 'friend-request-banner'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const bannerActions = document.getElementById('friend-banner-actions');
    if (bannerActions) bannerActions.style.display = 'none';
    
    document.getElementById('input-container').style.display = 'none';
    document.getElementById('chat-messages').innerHTML = `<div style="text-align: center; color: #999; margin-top: 50px;"><p>Hãy chọn một người bạn để nhắn tin</p></div>`;
    document.getElementById('header-text').innerText = "Chọn một cuộc trò chuyện";
    document.getElementById('home-btn-header').style.display = 'none';
    document.getElementById('delete-history-btn').style.display = 'none';
    clearAllFiles();
    cancelReply();
}

// ===== CHAT LISTENERS =====
function cleanupChatListeners() {
    if (currentUserListenerRef && currentChatUid) {
        off(ref(db, `users/${currentChatUid}`), currentUserListenerRef);
        currentUserListenerRef = null;
    }
    if (currentStatusListenerRef) {
        off(ref(db, `friend_status`), currentStatusListenerRef);
        currentStatusListenerRef = null;
    }
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }
    if (currentClearListenerRef) {
        off(ref(db, `users/${currentUser.uid}/cleared_chats/${activeChatId}`), currentClearListenerRef);
        currentClearListenerRef = null;
    }
}

function cleanupGlobalListeners() {
    if (globalFriendStatusListener && currentUser) {
        off(ref(db, `friend_status/${currentUser.uid}`), globalFriendStatusListener);
        globalFriendStatusListener = null;
    }
    if (globalMessagesListener) {
        off(ref(db, `messages`), globalMessagesListener);
        globalMessagesListener = null;
    }
}

function getDisplayNameWithBadge(name, haveGreenTick) {
    if (haveGreenTick === true) {
        return `${escapeHtml(name)} <i class="fas fa-check-circle verified-icon" style="color: #1da1f2; font-size: 14px;" title="Tài khoản đã được xác minh"></i>`;
    }
    return escapeHtml(name);
}

// ===== RENDER LINK ACCOUNT UI =====
function renderLinkAccountUI() {
    const container = document.getElementById('linkAccountContainer');
    if (!container) return;
    
    const userData = userDataCache || {};
    const linkedProviders = userData.providers || [];
    const primaryProvider = linkedProviders.length > 0 ? linkedProviders[0] : null;
    
    const providers = [
        { id: 'password', name: 'Email & Mật khẩu', icon: 'fa-envelope', color: 'email' },
        { id: 'google', name: 'Google', icon: 'fa-brands fa-google', color: 'google' }
    ];
    
    let html = '';
    
    providers.forEach(provider => {
        const isLinked = linkedProviders.includes(provider.id);
        const isPrimary = primaryProvider === provider.id;
        const isOnlyOne = linkedProviders.length === 1 && isLinked;
        
        let statusHtml = '';
        let actionHtml = '';
        
        if (isLinked) {
            statusHtml = `<span class="status-badge linked">✓ Đã liên kết</span>`;
            if (isPrimary) {
                statusHtml += ` <span class="status-badge primary">Chính</span>`;
            }
            
            if (!isOnlyOne && linkedProviders.length > 1) {
                actionHtml = `<button class="btn-link-action unlink-btn" onclick="unlinkProvider('${provider.id}')">
                    <i class="fas fa-unlink"></i> Ngắt kết nối
                </button>`;
            } else if (isOnlyOne) {
                actionHtml = `<button class="btn-link-action unlink-btn" disabled>
                    <i class="fas fa-lock"></i> Không thể ngắt
                </button>`;
            } else {
                actionHtml = `<button class="btn-link-action unlink-btn" disabled>
                    <i class="fas fa-lock"></i> Cần phương thức khác
                </button>`;
            }
        } else {
            statusHtml = `<span class="status-badge unlinked">Chưa liên kết</span>`;
            
            if (provider.id === 'google') {
                actionHtml = `<button class="btn-link-action link-btn" onclick="linkProvider('${provider.id}')">
                    <i class="fas fa-link"></i> Liên kết
                </button>`;
            } else if (provider.id === 'password') {
                actionHtml = `<button class="btn-link-action link-btn" onclick="switchPrivacySection('security'); showToast('Hướng dẫn', 'Vui lòng nhập mật khẩu mới trong tab Bảo mật để liên kết tài khoản Email.', 'info')">
                    <i class="fas fa-key"></i> Thêm mật khẩu
                </button>`;
            } else {
                actionHtml = `<span class="text-muted small">Chưa hỗ trợ</span>`;
            }
        }
        
        let iconColor = '';
        if (provider.color === 'google') iconColor = '#ea4335';
        else if (provider.color === 'email') iconColor = '#1a73e8';
        
        html += `
            <div class="link-account-item">
                <div class="provider-info">
                    <div class="provider-icon ${provider.color}" style="background: ${iconColor};">
                        <i class="fas ${provider.icon}"></i>
                    </div>
                    <div>
                        <div class="provider-name">${provider.name}</div>
                        <div class="provider-status">${statusHtml}</div>
                    </div>
                </div>
                <div>
                    ${actionHtml}
                </div>
            </div>
        `;
    });
    
    html += `
        <div class="link-account-help" style="margin-top: 12px;">
            <i class="fas fa-info-circle"></i>
            <span>Số lượng phương thức đăng nhập: <strong>${linkedProviders.length}</strong></span>
            <br>
            <span class="text-muted small">Bạn cần ít nhất 2 phương thức để có thể ngắt kết nối một phương thức.</span>
        </div>
    `;
    
    container.innerHTML = html;
}

// ===== LINK PROVIDER - GOOGLE =====
window.linkProvider = async (providerId) => {
    if (providerId === 'google') {
        if (!currentUser) {
            showToast('Lỗi', 'Vui lòng đăng nhập trước khi liên kết tài khoản.', 'error');
            return;
        }
        
        try {
            const userData = userDataCache || {};
            const currentEmail = userData.email || currentUser.email;
            const currentProviders = userData.providers || [];
            
            if (currentProviders.includes('google')) {
                showToast('Thông báo', 'Tài khoản Google đã được liên kết.', 'info');
                renderLinkAccountUI();
                return;
            }
            
            showLoading('Đang liên kết tài khoản Google...');
            
            const provider = new GoogleAuthProvider();
            
            const result = await signInWithPopup(auth, provider);
            const googleUser = result.user;
            
            if (googleUser.email.toLowerCase() === currentEmail.toLowerCase()) {
                const newProviders = [...currentProviders, 'google'];
                
                await update(ref(db, `users/${currentUser.uid}`), { 
                    providers: newProviders 
                });
                
                userDataCache = { ...userData, providers: newProviders };
                renderLinkAccountUI();
                
                hideLoading();
                showToast('Thành công', 'Đã liên kết tài khoản Google thành công!', 'success');
            } else {
                hideLoading();
                showToast('Lỗi', 'Email Google không khớp với email hiện tại.', 'error');
            }
            
        } catch (error) {
            hideLoading();
            console.error('Lỗi liên kết Google:', error);
            
            if (error.code === 'auth/popup-closed-by-user') {
                showToast('Thông báo', 'Bạn đã đóng cửa sổ đăng nhập.', 'warning');
            } else if (error.code === 'auth/credential-already-in-use') {
                showToast('Thông báo', 'Tài khoản Google này đã được liên kết với tài khoản khác.', 'warning');
            } else {
                showToast('Lỗi', 'Không thể liên kết tài khoản Google. Vui lòng thử lại.', 'error');
            }
        }
    }
};

// ===== SHOW/HIDE LOADING =====
function showLoading(message = 'Đang xử lý...') {
    const overlay = document.getElementById('formLoadingOverlay');
    if (overlay) {
        document.getElementById('loadingText').textContent = message;
        overlay.classList.add('show');
    }
}

function hideLoading() {
    const overlay = document.getElementById('formLoadingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}

// ===== UNLINK PROVIDER =====
window.unlinkProvider = async (providerId) => {
    const snap = await get(ref(db, `users/${currentUser.uid}`));
    if (!snap.exists()) return;
    
    const data = snap.val();
    let providers = data.providers || [];
    
    if (providers.length <= 1) {
        showToast('Thông báo', 'Bạn cần có ít nhất 2 phương thức đăng nhập để ngắt kết nối.', 'warning');
        renderLinkAccountUI();
        return;
    }
    
    if (providerId === 'password') {
        const socialProviders = providers.filter(p => p !== 'password');
        if (socialProviders.length === 0) {
            showToast('Thông báo', 'Bạn cần có ít nhất 1 phương thức đăng nhập thay thế để ngắt kết nối Email.', 'warning');
            renderLinkAccountUI();
            return;
        }
    }
    
    if (providerId === 'google') {
        const otherProviders = providers.filter(p => p !== 'google');
        if (otherProviders.length === 0) {
            showToast('Thông báo', 'Bạn cần có ít nhất 1 phương thức đăng nhập thay thế để ngắt kết nối Google.', 'warning');
            renderLinkAccountUI();
            return;
        }
    }
    
    if (providers.length === 2 && providers[0] === providerId) {
        showConfirm(
            `<div class="text-center">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--warning); display: block; margin-bottom: 15px;"></i>
                <p><strong>Đây là phương thức đăng nhập chính của bạn.</strong></p>
                <p class="text-muted small">Sau khi ngắt kết nối, phương thức còn lại sẽ trở thành phương thức chính.</p>
            </div>`,
            async () => {
                await performUnlink(providerId, providers, data);
            }
        );
    } else {
        showConfirm(
            `<div class="text-center">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--danger); display: block; margin-bottom: 15px;"></i>
                <p><strong>Bạn có chắc chắn muốn ngắt kết nối <span style="color: var(--danger);">${providerId === 'password' ? 'Email & Mật khẩu' : providerId === 'google' ? 'Google' : providerId}</span>?</strong></p>
                <p class="text-muted small">Sau khi ngắt kết nối, bạn sẽ không thể đăng nhập bằng phương thức này nữa.</p>
            </div>`,
            async () => {
                await performUnlink(providerId, providers, data);
            }
        );
    }
};

async function performUnlink(providerId, providers, data) {
    try {
        const newProviders = providers.filter(p => p !== providerId);
        
        await update(ref(db, `users/${currentUser.uid}`), { 
            providers: newProviders 
        });
        
        userDataCache = { ...data, providers: newProviders };
        renderLinkAccountUI();
        
        showToast('Thành công', 'Đã ngắt kết nối thành công!', 'success');
    } catch (error) {
        console.error('Lỗi ngắt kết nối:', error);
        showToast('Lỗi', 'Không thể ngắt kết nối. Vui lòng thử lại.', 'error');
    }
}

// ===== SAVE SOCIAL AVATAR =====
async function saveSocialAvatar(user) {
    if (!user || !user.photoURL) return null;
    
    try {
        const snap = await get(ref(db, `users/${user.uid}/avatar`));
        if (snap.exists()) return snap.val();
        
        const response = await fetch(user.photoURL);
        const blob = await response.blob();
        const reader = new FileReader();
        const avatarData = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        
        await update(ref(db, `users/${user.uid}`), { avatar: avatarData });
        return avatarData;
    } catch (e) {
        console.warn('Không thể lưu avatar từ social:', e);
        return null;
    }
}

// ===== AUTH STATE =====
let authStateProcessed = false;

onAuthStateChanged(auth, (user) => {
    // KIỂM TRA FLAG REMOTE LOGOUT - ƯU TIÊN CAO NHẤT
    const isRemoteLogout = localStorage.getItem('viechat_remote_logout') === 'true';
    const urlParams = new URLSearchParams(window.location.search);
    const forceLogout = urlParams.get('force_logout');
    const remoteLogoutParam = urlParams.get('remote_logout');
    
    // Nếu có tham số force_logout hoặc remote_logout trong URL
    if (forceLogout || remoteLogoutParam === 'true') {
        console.log('🚫 Phát hiện tham số logout trong URL, xóa toàn bộ dữ liệu');
        clearAllAuthData();
        
        // Đăng xuất khỏi Firebase
        if (user) {
            signOut(auth).catch(() => {});
        }
        
        // Xóa tham số URL và chuyển về trang login
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.href = 'index.html';
        return;
    }
    
    // Nếu có flag remote logout, KHÔNG CHO PHÉP ĐĂNG NHẬP
    if (isRemoteLogout) {
        console.log('🚫 Phát hiện remote logout, chuyển về trang login');
        
        // Xóa toàn bộ dữ liệu
        clearAllAuthData();
        
        // Đăng xuất khỏi Firebase
        if (user) {
            signOut(auth).catch(() => {});
        }
        
        // Xóa flag
        localStorage.removeItem('viechat_remote_logout');
        
        // Chuyển về trang login
        window.location.href = 'index.html?remote_logout=true';
        return;
    }
    
    if (!user) { 
        console.log('👤 User chưa đăng nhập');
        
        // Dọn dẹp listeners
        cleanupChatListeners(); 
        cleanupGlobalListeners();
        
        // Xóa session listener
        if (sessionListenerRef) {
            try {
                if (typeof sessionListenerRef === 'function') {
                    sessionListenerRef();
                }
            } catch (error) {
                console.warn('Lỗi khi hủy session listener:', error);
            }
            sessionListenerRef = null;
        }
        
        // Xóa sessions listener
        if (sessionsListenerRef) {
            try {
                off(sessionsListenerRef);
            } catch (error) {
                console.warn('Lỗi khi hủy sessions listener:', error);
            }
            sessionsListenerRef = null;
        }
        
        // Reset flag
        isLoggingOut = false;
        currentUser = null;
        authStateProcessed = false;
        
        // Kiểm tra tham số URL để chuyển hướng
        const uid = urlParams.get('uid');
        if (uid) {
            window.location.href = `index.html?redirect=chat&uid=${uid}`;
        } else {
            window.location.href = "index.html";
        }
    } else {
        // KIỂM TRA LẠI FLAG MỘT LẦN NỮA TRƯỚC KHI CHO PHÉP ĐĂNG NHẬP
        if (localStorage.getItem('viechat_remote_logout') === 'true') {
            console.log('🚫 Phát hiện remote logout, đăng xuất ngay lập tức');
            clearAllAuthData();
            signOut(auth);
            localStorage.removeItem('viechat_remote_logout');
            window.location.href = 'index.html?remote_logout=true';
            return;
        }
        
        // Nếu đã xử lý auth state rồi, bỏ qua để tránh loop
        if (authStateProcessed) {
            console.log('ℹ️ Auth state đã được xử lý, bỏ qua');
            return;
        }
        authStateProcessed = true;
        
        console.log('👤 User đã đăng nhập:', user.uid);
        currentUser = user;
        
        // Reset logout flag khi đăng nhập
        isLoggingOut = false;
        
        // Kiểm tra user có trong DB không
        get(ref(db, `users/${user.uid}`)).then((snap) => {
            if (!snap.exists()) {
                showToast('Thông báo', 'Tài khoản chưa được đăng ký đầy đủ.', 'warning');
                signOut(auth);
                window.location.href = "index.html";
                return;
            }
            
            // Lắng nghe thay đổi dữ liệu user
            onValue(ref(db, `users/${user.uid}`), (dataSnap) => {
                const data = dataSnap.val();
                if (!data) return;
                
                // Kiểm tra tài khoản bị khóa
                if (data.isLocked === true || data.isLocked === "true") { 
                    showToast('Thông báo', 'Tài khoản của bạn đã bị khóa.', 'error');
                    signOut(auth); 
                    return; 
                }
                
                // Cập nhật cache
                userDataCache = data;
                
                // Hiển thị thông tin user
                const displayEmail = data.email || user.email || 'Chưa có email';
                document.getElementById('my-email').innerText = displayEmail;
                document.getElementById('my-name').innerHTML = getDisplayNameWithBadge(
                    data.name || "Người dùng", 
                    data.haveGreenTick === true
                );
                
                // Cập nhật avatar
                let avatar = getAvatarDataFromUser(data);
                
                if (!avatar && user.photoURL) {
                    fetch(user.photoURL)
                        .then(res => res.blob())
                        .then(blob => {
                            const reader = new FileReader();
                            reader.onload = async () => {
                                const avatarData = reader.result;
                                await update(ref(db, `users/${user.uid}`), { avatar: avatarData });
                                updateAvatarUI(avatarData);
                                userDataCache.avatar = avatarData;
                            };
                            reader.readAsDataURL(blob);
                        })
                        .catch(e => console.warn('Không thể tải avatar từ social:', e));
                }
                
                updateAvatarUI(avatar);
                
                if (!avatar) {
                    const placeholder = document.getElementById('my-avatar-placeholder');
                    const name = data.name || 'Người dùng';
                    placeholder.textContent = name.charAt(0).toUpperCase();
                }
                
                // Kiểm tra độ tuổi
                if (data.birthday && isUnderAge(data.birthday) && !ageWarningShown) {
                    setTimeout(() => {
                        showAgeWarning();
                    }, 1000);
                }
                
                // Tạo userId nếu chưa có
                ensureUserId(user.uid).then((userId) => {
                    if (userId) {
                        updateReferralLinkWithId(userId);
                        updateReferralLinkInPrivacy(userId);
                        updateProfileLinkInPrivacy(userId);
                        localStorage.setItem('viechat_userId', userId);
                    }
                }).catch((err) => {
                    console.error('Lỗi tạo userId:', err);
                });
                
                // ===== LẮNG NGHE SESSION REALTIME =====
                listenToSessionsRealtime();
                
                // ===== LƯU SESSION KHI ĐĂNG NHẬP =====
                setTimeout(async () => {
                    await saveDeviceSession(user);
                    await cleanupInactiveSessions();
                    listenForSessionChanges();
                }, 2000);
                
                // ===== CẬP NHẬT VỊ TRÍ CHO SESSION CŨ =====
                setTimeout(() => {
                    updateLocationsForExistingSessions();
                }, 3000);
                
                // Đồng bộ danh sách
                syncLists(); 
                setupOutsideClick();
                
                // Xử lý tham số URL để mở chat
                if (window.location.search.includes('uid')) {
                    setTimeout(() => {
                        hideProcessingOverlay();
                        handleUrlParams();
                    }, 1500);
                } else {
                    hideProcessingOverlay();
                }
                
                // Nếu modal đang mở, cập nhật UI link account
                if (privacySettingsModalObj && document.getElementById('privacySettingsModal').classList.contains('show')) {
                    renderLinkAccountUI();
                }
            });
        }).catch((error) => {
            console.error('Lỗi kiểm tra user:', error);
            showToast('Lỗi', 'Không thể kiểm tra thông tin tài khoản.', 'error');
            signOut(auth);
            window.location.href = "index.html";
        });
    }
});

// ===== SHOW/HIDE PROCESSING OVERLAY =====
function showProcessingOverlay() {
    const overlay = document.getElementById('processingOverlay');
    if (overlay) {
        overlay.classList.add('show');
    }
}

function hideProcessingOverlay() {
    const overlay = document.getElementById('processingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}

// ===== KIỂM TRA THAM SỐ URL KHI LOAD TRANG =====
function checkUrlParamsOnLoad() {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    
    if (uid) {
        showProcessingOverlay();
        console.log('🔄 Đang xử lý chuyển hướng từ profile-details...');
    }
}

checkUrlParamsOnLoad();

// ===== USER ID GENERATION =====
function generateUserId() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let userId = '';
    for (let i = 0; i < 8; i++) {
        userId += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return userId;
}

async function ensureUserId(uid) {
    try {
        const userSnap = await get(ref(db, `users/${uid}`));
        if (!userSnap.exists()) return null;
        
        const userData = userSnap.val();
        
        if (userData.userId) {
            return userData.userId;
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
        
        if (isDuplicate) {
            console.error('Không thể tạo userId duy nhất');
            return null;
        }
        
        await update(ref(db), {
            [`users/${uid}/userId`]: userId,
            [`users_by_id/${userId}`]: uid
        });
        
        return userId;
    } catch (error) {
        console.error('Lỗi tạo userId:', error);
        return null;
    }
}

// ===== SHOW CONFIRM =====
window.showConfirm = (message, onOk) => {
    document.getElementById('confirmModalBody').innerHTML = message;
    pendingConfirmCallback = onOk;
    const modalEl = document.getElementById('confirmModal');
    closeAllModals();
    setTimeout(() => {
        const modal = new bootstrap.Modal(modalEl);
        activeModalInstance = modal;
        document.getElementById('confirmModalOkBtn').onclick = () => { 
            if(pendingConfirmCallback) pendingConfirmCallback(); 
            modal.hide();
            activeModalInstance = null;
        };
        modalEl.addEventListener('hidden.bs.modal', function handleHidden() {
            modalEl.removeEventListener('hidden.bs.modal', handleHidden);
            if (activeModalInstance === modal) activeModalInstance = null;
        }, { once: true });
        modal.show();
    }, 150);
};

// ===== SHOW LOGOUT =====
window.showLogoutConfirm = () => {
    const modalEl = document.getElementById('logoutConfirmModal');
    closeAllModals();
    setTimeout(() => {
        const modal = new bootstrap.Modal(modalEl);
        activeModalInstance = modal;
        document.getElementById('logoutConfirmOkBtn').onclick = () => { 
            modal.hide(); 
            activeModalInstance = null;
            
            // Đánh dấu đang đăng xuất
            isLoggingOut = true;
            
            // Xóa session và đăng xuất (không phải xóa tài khoản)
            clearCurrentSession(false);
            
            // Xóa toàn bộ dữ liệu
            clearAllAuthData();
            
            // Đăng xuất khỏi Firebase
            signOut(auth).then(() => {
                console.log('✅ Đã đăng xuất thành công');
            }).catch((error) => {
                console.error('Lỗi đăng xuất:', error);
            });
            
            // Reset flag sau 2 giây
            setTimeout(() => {
                isLoggingOut = false;
            }, 2000);
        };
        modalEl.addEventListener('hidden.bs.modal', function handleHidden() {
            modalEl.removeEventListener('hidden.bs.modal', handleHidden);
            if (activeModalInstance === modal) activeModalInstance = null;
        }, { once: true });
        modal.show();
    }, 150);
};

window.showPrivacyModal = async () => {
    try {
        const snap = await get(ref(db, `users/${currentUser.uid}`));
        if (snap.exists()) {
            const d = snap.val();
            userDataCache = d;
            
            document.getElementById('privInputName').value = d.name || '';
            document.getElementById('privInputGender').value = d.gender || "Nam";
            document.getElementById('privInputBirthday').value = d.birthday || "2000-01-01";
            
            document.getElementById('privSwitchShowGender').checked = d.showGender !== false;
            document.getElementById('privSwitchShowBirthday').checked = d.showBirthday !== false;
            document.getElementById('privSwitchAllowSearch').checked = d.allowSearch !== false;
            document.getElementById('privSwitchAllowFriend').checked = d.allowFriendRequest !== false;
            document.getElementById('privSwitchAllowStrangerChat').checked = d.allowStrangerChat !== false;
            
            const providers = d.providers || [];
            const hasPasswordProvider = providers.includes('password');
            const oldPasswordGroup = document.getElementById('privOldPasswordGroup');
            if (oldPasswordGroup) {
                oldPasswordGroup.style.display = hasPasswordProvider ? 'block' : 'none';
            }
            
            document.getElementById('privOldPassword').value = '';
            document.getElementById('privNewPassword').value = '';
            document.getElementById('privConfirmPassword').value = '';
            document.getElementById('privDeleteConfirmCode').value = '';
            
            updatePasswordStrengthUI('', 'privStrengthFill', 'privStrengthLabel', 'priv');
            
            const userId = d.userId || localStorage.getItem('viechat_userId');
            if (userId) {
                updateProfileLinkInPrivacy(userId);
                updateReferralLinkInPrivacy(userId);
            }
            
            const modalEl = document.getElementById('privacySettingsModal');
            closeAllModals();
            setTimeout(() => {
                privacySettingsModalObj = new bootstrap.Modal(modalEl);
                activeModalInstance = privacySettingsModalObj;
                modalEl.addEventListener('hidden.bs.modal', function handleHidden() {
                    modalEl.removeEventListener('hidden.bs.modal', handleHidden);
                    activeModalInstance = null;
                }, { once: true });
                privacySettingsModalObj.show();
                
                setTimeout(() => {
                    renderLinkAccountUI();
                    checkActivationStatus();
                    const activeSection = document.querySelector('.privacy-content .content-section.active');
                    if (activeSection && activeSection.id === 'section-securitycheck') {
                        renderDeviceList();
                    }
                }, 300);
            }, 150);
        }
    } catch (error) {
        console.error('Lỗi mở modal:', error);
        showToast('Lỗi', 'Không thể mở cài đặt. Vui lòng thử lại.', 'error');
    }
};

// ===== SAVE ALL PROFILE INFORMATION =====
window.saveAllProfileInfo = async () => {
    if (!currentUser) {
        showToast("Lỗi", "Bạn chưa đăng nhập. Vui lòng đăng nhập và thực hiện lại thao tác này", "error");
        return;
    }
    
    const name = document.getElementById('privInputName').value.trim();
    const gender = document.getElementById('privInputGender').value;
    const birthday = document.getElementById('privInputBirthday').value;
    
    if (!name) {
        showToast("Lỗi", "Tên hiển thị không được để trống.", "error");
        document.getElementById('privInputName').focus();
        return;
    }
    
    if (!birthday) {
        showToast("Lỗi", "Vui lòng chọn ngày sinh.", "error");
        document.getElementById('privInputBirthday').focus();
        return;
    }
    
    try {
        const updateData = {
            name: name,
            gender: gender,
            birthday: birthday
        };
        
        await update(ref(db, `users/${currentUser.uid}`), updateData);
        
        const userSnap = await get(ref(db, `users/${currentUser.uid}`));
        if (userSnap.exists()) {
            const data = userSnap.val();
            userDataCache = data;
            document.getElementById('my-name').innerHTML = getDisplayNameWithBadge(data.name || "Người dùng", data.haveGreenTick === true);
            
            const avatar = getAvatarDataFromUser(data);
            if (!avatar) {
                const placeholder = document.getElementById('my-avatar-placeholder');
                placeholder.textContent = (data.name || 'U').charAt(0).toUpperCase();
            }
        }
        
        if (birthday) {
            if (!isUnderAge(birthday)) {
                if (ageWarningModalObj) {
                    ageWarningModalObj.hide();
                    ageWarningModalObj = null;
                }
                ageWarningShown = false;
            } else {
                showAgeWarning();
            }
        }
        
        showToast("Thành công", "Đã cập nhật thông tin cá nhân thành công!", "success");
        
    } catch (error) {
        console.error('Lỗi lưu thông tin:', error);
        showToast("Lỗi", "Không thể lưu thông tin. Vui lòng thử lại.", "error");
    }
};

// ===== CHANGE PASSWORD FROM PRIVACY =====
window.changePasswordFromPrivacy = async () => {
    const newPw = document.getElementById('privNewPassword').value;
    const confPw = document.getElementById('privConfirmPassword').value;
    
    if (!newPw || !confPw) {
        showToast("Lỗi", "Vui lòng nhập đầy đủ mật khẩu mới và xác nhận.", "error");
        return;
    }
    
    const strengthResult = checkPasswordStrength(newPw);
    if (!strengthResult.isValid) {
        showToast("Mật khẩu yếu", "Vui lòng tạo mật khẩu mạnh hơn với ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.", "error");
        return;
    }
    
    if (newPw !== confPw) {
        showToast("Lỗi", "Xác nhận mật khẩu mới không khớp.", "error");
        return;
    }
    
    if (newPw.length < 6) {
        showToast("Lỗi", "Mật khẩu mới phải từ 6 ký tự trở lên.", "error");
        return;
    }
    
    const userSnap = await get(ref(db, `users/${currentUser.uid}`));
    let hasPasswordProvider = false;
    let currentProviders = [];
    if (userSnap.exists()) {
        const userData = userSnap.val();
        currentProviders = userData.providers || [];
        hasPasswordProvider = currentProviders.includes('password');
    }
    
    if (hasPasswordProvider) {
        const oldPw = document.getElementById('privOldPassword').value;
        if (!oldPw) {
            showToast("Lỗi", "Vui lòng nhập mật khẩu cũ để xác thực.", "error");
            document.getElementById('privOldPassword').focus();
            return;
        }
        
        try {
            const credential = EmailAuthProvider.credential(currentUser.email, oldPw);
            await reauthenticateWithCredential(auth.currentUser, credential);
            await updatePassword(auth.currentUser, newPw);
            
            document.getElementById('privOldPassword').value = '';
            document.getElementById('privNewPassword').value = '';
            document.getElementById('privConfirmPassword').value = '';
            updatePasswordStrengthUI('', 'privStrengthFill', 'privStrengthLabel', 'priv');
            showToast("Thành công", "Đã thay đổi mật khẩu thành công.", "success");
        } catch (error) {
            if (error.code === 'auth/wrong-password') {
                showToast("Lỗi", "Mật khẩu cũ không chính xác. Vui lòng thử lại.", "error");
            } else {
                showToast("Lỗi", "Không thể đổi mật khẩu. Vui lòng thử lại.", "error");
            }
        }
    } else {
        try {
            await updatePassword(auth.currentUser, newPw);
            
            const newProviders = [...currentProviders, 'password'];
            await update(ref(db, `users/${currentUser.uid}`), {
                providers: newProviders
            });
            
            userDataCache.providers = newProviders;
            
            document.getElementById('privNewPassword').value = '';
            document.getElementById('privConfirmPassword').value = '';
            updatePasswordStrengthUI('', 'privStrengthFill', 'privStrengthLabel', 'priv');
            
            const oldPasswordGroup = document.getElementById('privOldPasswordGroup');
            if (oldPasswordGroup) {
                oldPasswordGroup.style.display = 'block';
            }
            
            showToast("Thành công", "Đã thêm mật khẩu và đổi mật khẩu thành công!", "success");
            
            renderLinkAccountUI();
        } catch (error) {
            console.error('Lỗi đổi mật khẩu social:', error);
            showToast("Lỗi", "Không thể đổi mật khẩu. Vui lòng thử lại.", "error");
        }
    }
};

// ===== SAVE PRIVACY SETTINGS =====
window.savePrivacySettings = async () => {
    const newBirthday = document.getElementById('privInputBirthday').value;
    const upd = {
        showGender: document.getElementById('privSwitchShowGender').checked,
        showBirthday: document.getElementById('privSwitchShowBirthday').checked,
        allowSearch: document.getElementById('privSwitchAllowSearch').checked,
        allowFriendRequest: document.getElementById('privSwitchAllowFriend').checked,
        allowStrangerChat: document.getElementById('privSwitchAllowStrangerChat').checked,
    };
    await update(ref(db, `users/${currentUser.uid}`), upd);
    
    if (newBirthday && !isUnderAge(newBirthday)) {
        if (ageWarningModalObj) {
            ageWarningModalObj.hide();
            ageWarningModalObj = null;
        }
        ageWarningShown = false;
    }
    
    showToast("Thành công", "Đã cập nhật cài đặt quyền riêng tư.", "success");
};

// ===== DELETE ACCOUNT FROM PRIVACY =====
window.deleteAccountFromPrivacy = async () => {
    const code = document.getElementById('privDeleteConfirmCode').value.trim();
    if (code !== "XOATOANBO") {
        showToast("Lỗi", 'Mã xác nhận không chính xác. Vui lòng nhập "XOATOANBO".', "error");
        return;
    }
    
    if (privacySettingsModalObj) {
        privacySettingsModalObj.hide();
        activeModalInstance = null;
    }
    
    showConfirm("Hành động này không thể hoàn tác. Bạn có thực sự chắc chắn?", async () => {
        try {
            const uid = currentUser.uid;
            await remove(ref(db, `users/${uid}`));
            await remove(ref(db, `friend_status/${uid}`));
            await deleteUser(auth.currentUser);
        } catch (error) {
            showToast("Lỗi xác thực", "Vui lòng đăng xuất, đăng nhập lại và thực hiện lại thao tác này.", "error");
        }
    });
};

window.switchPrivacySection = (section) => {
    // 1. Cập nhật active class cho sidebar buttons
    document.querySelectorAll('.privacy-sidebar .menu-item-privacy').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.privacy-sidebar .menu-item-privacy[data-section="${section}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // 2. Ẩn tất cả content sections
    document.querySelectorAll('.privacy-content .content-section').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    // 3. Hiển thị section được chọn
    const targetSection = document.getElementById(`section-${section}`);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
    }
    
    // 4. Xử lý đặc biệt cho từng section
    if (section === 'securitycheck') {
        renderDeviceList();
    } else if (section === 'linkaccount') {
        renderLinkAccountUI();
    } else if (section === 'activation') {
        checkActivationStatus();
    }
    
    // 5. Fix scroll sau khi chuyển tab (CHỈ TRÊN PC)
    if (window.innerWidth > 790) {
        setTimeout(adjustPrivacyModalHeight, 50);
        setTimeout(adjustPrivacyModalHeight, 150);
    }
};

// ===== OPEN SEARCH MODAL =====
window.openSearchModal = () => {
    document.getElementById('searchEmailInput').value = '';
    document.getElementById('searchResultArea').style.display = 'none';
    document.getElementById('searchResultContent').innerHTML = '';
    const modalEl = document.getElementById('searchModal');
    closeAllModals();
    setTimeout(() => {
        searchModalObj = new bootstrap.Modal(modalEl);
        activeModalInstance = searchModalObj;
        modalEl.addEventListener('hidden.bs.modal', function handleHidden() {
            modalEl.removeEventListener('hidden.bs.modal', handleHidden);
            activeModalInstance = null;
        }, { once: true });
        searchModalObj.show();
    }, 150);
};

// ===== PERFORM SEARCH =====
window.performSearch = async () => {
    const email = document.getElementById('searchEmailInput').value.trim().toLowerCase();
    
    if (!email) {
        showToast("Lỗi", "Vui lòng nhập email cần tìm.", "error");
        return;
    }
    
    if (email === currentUser.email) {
        showToast("Thông báo", "Bạn không thể tìm kiếm chính mình.", "warning");
        return;
    }

    const q = query(ref(db, 'users'), orderByChild('email'), equalTo(email));
    const snap = await get(q);
    
    const resultArea = document.getElementById('searchResultArea');
    const resultContent = document.getElementById('searchResultContent');
    
    if (!snap.exists()) {
        showToast("Lỗi", "Không tìm thấy người dùng này hoặc người này không cho phép tìm kiếm thông tin của họ", "error");
        return;
    }
    
    const targetUid = Object.keys(snap.val())[0];
    const targetData = snap.val()[targetUid];
    currentSearchTarget = { uid: targetUid, data: targetData };
    
    if (targetData.allowSearch === false) {
        showToast("Lỗi", "Không tìm thấy người dùng này hoặc người này không cho phép tìm kiếm thông tin của họ", "warning");
        return;
    }
    
    const statusSnap = await get(ref(db, `friend_status/${currentUser.uid}/${targetUid}`));
    const currentStatus = statusSnap.val();
    
    const firstLetter = (targetData.name || "U").charAt(0).toUpperCase();
    const avatar = getAvatarDataFromUser(targetData);
    const verifiedHtml = targetData.haveGreenTick === true ? `<i class="fas fa-check-circle verified-icon" style="color: #1da1f2; margin-left: 4px;" title="Tài khoản đã được xác minh"></i>` : '';
    
    let avatarHtml = '';
    if (avatar) {
        avatarHtml = `<img src="${avatar}" class="search-user-avatar" style="width:50px; height:50px; border-radius:50%; object-fit:cover; flex-shrink:0;">`;
    } else {
        avatarHtml = `<div class="search-user-avatar">${firstLetter}</div>`;
    }
    
    let actionsHtml = '';
    actionsHtml += `<button class="btn btn-info btn-sm" onclick="viewUserDetailsFromSearch('${targetUid}', '${targetData.name.replace(/'/g, "\\'")}')">📋 Thông tin</button>`;
    
    if (currentStatus === "accepted") {
        actionsHtml += `<button class="btn btn-primary btn-sm" onclick="directMessageFromSearch('${targetUid}', '${targetData.name.replace(/'/g, "\\'")}')">💬 Nhắn tin</button>`;
    } else {
        if (targetData.allowFriendRequest !== false) {
            if (currentStatus === "outgoing") {
                actionsHtml += `<button class="btn btn-secondary btn-sm" disabled>⏳ Đã gửi lời mời</button>`;
            } else if (currentStatus === "incoming") {
                actionsHtml += `<button class="btn btn-success btn-sm" onclick="acceptFriendFromSearch('${targetUid}')">✅ Chấp nhận KB</button>`;
            } else {
                actionsHtml += `<button class="btn btn-success btn-sm" onclick="sendFriendRequestFromSearch('${targetUid}')">➕ Kết bạn</button>`;
            }
        }
        if (targetData.allowStrangerChat !== false) {
            actionsHtml += `<button class="btn btn-outline-primary btn-sm" onclick="directMessageFromSearch('${targetUid}', '${targetData.name.replace(/'/g, "\\'")}')">💬 Nhắn tin</button>`;
        }
    }
    
    resultContent.innerHTML = `
        <div class="search-result-card p-3 border rounded">
            <div class="search-user-info">
                ${avatarHtml}
                <div class="search-user-details">
                    <h6 class="mb-0">${escapeHtml(targetData.name || "Người dùng")}${verifiedHtml}</h6>
                    <p class="text-muted mb-0 small">${escapeHtml(targetData.email)}</p>
                </div>
            </div>
            <div class="search-user-actions">
                ${actionsHtml}
            </div>
        </div>
    `;
    
    resultArea.style.display = 'block';
};

// ===== ESCAPE HTML =====
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ===== SEARCH FUNCTIONS =====
window.viewUserDetailsFromSearch = async (uid, name) => {
    if (searchModalObj) {
        searchModalObj.hide();
        activeModalInstance = null;
    }
    openUserInfoModal(uid);
};

window.sendFriendRequestFromModal = async (targetUid) => {
    await set(ref(db, `friend_status/${currentUser.uid}/${targetUid}`), "outgoing");
    await set(ref(db, `friend_status/${targetUid}/${currentUser.uid}`), "incoming");
    closeModalObj();
    showToast("Đã gửi", "Yêu cầu kết bạn đã được gửi đi thành công!", "success");
    syncLists();
};

window.acceptFriendFromSearch = async (targetUid) => {
    await update(ref(db), {
        [`friend_status/${currentUser.uid}/${targetUid}`]: "accepted",
        [`friend_status/${targetUid}/${currentUser.uid}`]: "accepted"
    });
    if (searchModalObj) {
        searchModalObj.hide();
        activeModalInstance = null;
    }
    showToast("Thành công", "Đã chấp nhận kết bạn!", "success");
    syncLists();
};

window.sendFriendRequestFromSearch = async (targetUid) => {
    await set(ref(db, `friend_status/${currentUser.uid}/${targetUid}`), "outgoing");
    await set(ref(db, `friend_status/${targetUid}/${currentUser.uid}`), "incoming");
    if (searchModalObj) {
        searchModalObj.hide();
        activeModalInstance = null;
    }
    showToast("Đã gửi", "Yêu cầu kết bạn đã được gửi đi thành công!", "success");
    syncLists();
};

window.directMessageFromSearch = (uid, name) => {
    if (searchModalObj) {
        searchModalObj.hide();
        activeModalInstance = null;
    }
    openChatFunction(uid, name, null);
};

window.directMessageFromModal = (uid, name) => { 
    closeModalObj(); 
    openChatFunction(uid, name, null); 
};

// ===== UPDATE STATUS =====
window.updateStatus = async (uid, status) => {
    const myUid = currentUser.uid;
    const updates = {};
    
    try {
        if (status === 'accepted') {
            updates[`friend_status/${myUid}/${uid}`] = "accepted";
            updates[`friend_status/${uid}/${myUid}`] = "accepted";
            await update(ref(db), updates);
            showToast("Thành công", "Đã kết bạn thành công!", "success");
            setTimeout(() => openChatFunction(uid, "", null), 400);
            setTimeout(() => syncLists(), 500);
        } 
        else if (status === 'unblock') {
            await remove(ref(db, `friend_status/${myUid}/${uid}`));
            const theirStatus = await get(ref(db, `friend_status/${uid}/${myUid}`));
            if (theirStatus.val() === 'accepted') {
                await set(ref(db, `friend_status/${myUid}/${uid}`), 'accepted');
                showToast("Thành công", "Đã bỏ chặn", "success");
            } else {
                const chatId = myUid < uid ? `${myUid}_${uid}` : `${uid}_${myUid}`;
                const msgSnap = await get(ref(db, `messages/${chatId}`));
                if (msgSnap.exists()) {
                    await set(ref(db, `friend_status/${myUid}/${uid}`), 'stranger');
                }
                showToast("Thành công", "Đã bỏ chặn!", "success");
            }
            if(activeChatId && activeChatId.includes(uid)) goHome();
            setTimeout(() => syncLists(), 500);
        } 
        else if (status === 'unblock_stranger') {
            await remove(ref(db, `friend_status/${myUid}/${uid}`));
            const theirStatus = await get(ref(db, `friend_status/${uid}/${myUid}`));
            if (theirStatus.val() === 'accepted') {
                await set(ref(db, `friend_status/${myUid}/${uid}`), 'accepted');
                showToast("Thành công", "Đã bỏ chặn", "success");
            } else {
                const chatId = myUid < uid ? `${myUid}_${uid}` : `${uid}_${myUid}`;
                const msgSnap = await get(ref(db, `messages/${chatId}`));
                if (msgSnap.exists()) {
                    await set(ref(db, `friend_status/${myUid}/${uid}`), 'stranger');
                }
                showToast("Thành công", "Đã bỏ chặn!", "success");
            }
            if(activeChatId && activeChatId.includes(uid)) goHome();
            setTimeout(() => syncLists(), 500);
        } 
        else if (status === 'blocked') {
            const theirStatus = await get(ref(db, `friend_status/${uid}/${myUid}`));
            const currentRel = await get(ref(db, `friend_status/${myUid}/${uid}`));
            
            if (currentRel.val() === 'accepted' || theirStatus.val() === 'accepted') {
                await set(ref(db, `friend_status/${myUid}/${uid}`), "blocked");
                showToast("Thông báo", "Đã chặn bạn bè!", "warning");
            } else {
                await set(ref(db, `friend_status/${myUid}/${uid}`), "blocked");
                showToast("Thành công", "Đã chặn người dùng!", "warning");
            }
            
            if(activeChatId && activeChatId.includes(uid)) goHome();
            setTimeout(() => syncLists(), 500);
        } 
        else if (status === 'add_friend_stranger') {
            await remove(ref(db, `friend_status/${myUid}/${uid}`)).catch(() => {});
            await remove(ref(db, `friend_status/${uid}/${myUid}`)).catch(() => {});
            
            await set(ref(db, `friend_status/${myUid}/${uid}`), "outgoing");
            await set(ref(db, `friend_status/${uid}/${myUid}`), "incoming");
            
            const checkMy = await get(ref(db, `friend_status/${myUid}/${uid}`));
            const checkTheir = await get(ref(db, `friend_status/${uid}/${myUid}`));
            
            if (checkMy.val() === "outgoing" && checkTheir.val() === "incoming") {
                showToast("Đã gửi", "Yêu cầu kết bạn đã được gửi đi thành công!", "success");
                setTimeout(() => {
                    syncLists();
                    switchTab('outgoing');
                }, 500);
            } else {
                showToast("Lỗi", "Không thể gửi yêu cầu kết bạn. Vui lòng thử lại.", "error");
            }
        } 
        else if (status === 'reject') {
            const chatId = myUid < uid ? `${myUid}_${uid}` : `${uid}_${myUid}`;
            await set(ref(db, `users/${myUid}/cleared_chats/${chatId}`), Date.now());
            await remove(ref(db, `friend_status/${myUid}/${uid}`));
            await remove(ref(db, `friend_status/${uid}/${myUid}`));
            if(activeChatId && activeChatId.includes(uid)) goHome();
            showToast("Thành công", "Đã từ chối lời mời kết bạn!", "warning");
            setTimeout(() => syncLists(), 500);
        }
        else if (status === 'cancel') {
            await remove(ref(db, `friend_status/${myUid}/${uid}`));
            await remove(ref(db, `friend_status/${uid}/${myUid}`));
            showToast("Thành công", "Đã hủy yêu cầu kết bạn!", "warning");
            setTimeout(() => syncLists(), 500);
        }
        else if (status === 'remove') {
            showConfirm("Bạn có chắc chắn muốn xóa bạn bè này?", async () => {
                const chatId = myUid < uid ? `${myUid}_${uid}` : `${uid}_${myUid}`;
                await remove(ref(db, `friend_status/${myUid}/${uid}`));
                await remove(ref(db, `friend_status/${uid}/${myUid}`));
                await remove(ref(db, `messages/${chatId}`));
                if(activeChatId && activeChatId.includes(uid)) goHome();
                showToast("Thành công", "Đã xóa bạn bè!", "warning");
                setTimeout(() => syncLists(), 500);
            });
        }
        else if (status === 'delete_stranger_chat') {
            showConfirm(
                `<div class="text-center">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--danger); display: block; margin-bottom: 15px;"></i>
                    <p><strong>Bạn có chắc chắn muốn xóa cuộc trò chuyện này?</strong></p>
                    <p class="text-muted small">Hành động này sẽ xóa lịch sử trò chuyện và người này khỏi danh sách người lạ của bạn.<br>Người kia sẽ không bị ảnh hưởng.</p>
                </div>`,
                async () => {
                    const chatId = myUid < uid ? `${myUid}_${uid}` : `${uid}_${myUid}`;
                    await set(ref(db, `users/${myUid}/cleared_chats/${chatId}`), Date.now());
                    await remove(ref(db, `friend_status/${myUid}/${uid}`));
                    if(activeChatId && activeChatId.includes(uid)) goHome();
                    showToast("Thành công", "Đã xóa cuộc trò chuyện!", "success");
                    setTimeout(() => syncLists(), 500);
                }
            );
        }
    } catch (error) {
        console.error('Lỗi updateStatus:', error);
        showToast("Lỗi", "Không thể thực hiện hành động. Vui lòng thử lại.", "error");
    }
};

// ===== SYNC LISTS =====
function syncLists() {
    cleanupGlobalListeners();

    globalFriendStatusListener = onValue(ref(db, `friend_status/${currentUser.uid}`), (statusSnap) => {
        const relations = statusSnap.val() || {};
        let counts = { incoming: 0, outgoing: 0, friends: 0, strangers: 0 };
        
        document.querySelectorAll('.tab-content .item').forEach(el => el.remove());
        document.getElementById('incoming-list').innerHTML = ""; 
        document.getElementById('outgoing-list').innerHTML = ""; 
        document.getElementById('friend-list').innerHTML = "";
        document.getElementById('stranger-list').innerHTML = "";

        Object.keys(relations).forEach((uid) => {
            const status = relations[uid];
            if (status === 'stranger') return;
            
            get(ref(db, `users/${uid}`)).then((u) => {
                if (!u.exists()) {
                    remove(ref(db, `friend_status/${currentUser.uid}/${uid}`)).catch(() => {});
                    return;
                }
                const data = u.val();
                
                if (document.getElementById(`item-${uid}`)) return;
                
                const div = document.createElement('div'); 
                div.id = `item-${uid}`; 
                div.className = `item ${activeChatId && activeChatId.includes(uid) ? 'active' : ''}`;
                
                let acts = '';
                if(status === 'incoming') {
                    counts.incoming++;
                    acts = `<button class="btn-icon bg-success" onclick="event.stopPropagation();updateStatus('${uid}','accepted')">✔</button><button class="btn-icon bg-danger" onclick="event.stopPropagation();updateStatus('${uid}','reject')">✖</button>`;
                }
                else if(status === 'outgoing') {
                    counts.outgoing++;
                    acts = `<button class="btn-icon bg-secondary" onclick="event.stopPropagation();updateStatus('${uid}','cancel')">Hủy</button>`;
                }
                else if(status === 'accepted') {
                    counts.friends++;
                    acts = `<button class="btn-icon bg-secondary text-dark" onclick="event.stopPropagation();updateStatus('${uid}','blocked')">🚫</button><button class="btn-icon bg-danger" onclick="event.stopPropagation();updateStatus('${uid}','remove')">🗑</button>`;
                }
                else if(status === 'blocked') {
                    counts.strangers++;
                    acts = `<button class="btn-icon bg-primary" onclick="event.stopPropagation();updateStatus('${uid}','unblock')">Mở</button>`;
                }
                
                const verifiedHtml = data.haveGreenTick === true ? `<i class="fas fa-check-circle verified-icon" style="color: #1da1f2; margin-left: 4px;" title="Tài khoản đã được xác minh"></i>` : '';
                const avatar = getAvatarDataFromUser(data);
                const avatarHtml = avatar ? 
                    `<img src="${avatar}" class="item-avatar" style="width:36px; height:36px; border-radius:50%; object-fit:cover; margin-right:10px; flex-shrink:0;">` :
                    `<div class="item-avatar-placeholder" style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, var(--primary), #0056b3); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:14px; margin-right:10px; flex-shrink:0;">${(data.name || 'U').charAt(0).toUpperCase()}</div>`;
                
                div.innerHTML = `
                    <div style="display:flex; align-items:center; flex:1; min-width:0;">
                        ${avatarHtml}
                        <div class="item-info">
                            <div class="name">${escapeHtml(data.name)}${verifiedHtml}</div>
                            <div class="email">${escapeHtml(data.email)}</div>
                        </div>
                    </div>
                    <div class="btn-group">${acts}</div>
                `;
                div.onclick = () => { closeSidebar(); openChatFunction(uid, data.name, div); };
                
                if (status === 'incoming') {
                    document.getElementById('incoming-list').appendChild(div);
                } else if (status === 'outgoing') {
                    document.getElementById('outgoing-list').appendChild(div);
                } else if (status === 'accepted') {
                    document.getElementById('friend-list').appendChild(div);
                } else if (status === 'blocked') {
                    document.getElementById('stranger-list').appendChild(div);
                }
                
                updateBadgeCounts(counts);
            });
        });

        const strangerList = [];
        Object.keys(relations).forEach((uid) => {
            if (relations[uid] === 'stranger') {
                strangerList.push(uid);
            }
        });
        
        strangerList.forEach((uid) => {
            if (document.getElementById(`item-${uid}`)) return;
            
            get(ref(db, `users/${uid}`)).then((u) => {
                if (!u.exists()) {
                    remove(ref(db, `friend_status/${currentUser.uid}/${uid}`)).catch(() => {});
                    return;
                }
                
                const data = u.val();
                const chatId = currentUser.uid < uid ? `${currentUser.uid}_${uid}` : `${uid}_${currentUser.uid}`;
                
                get(ref(db, `messages/${chatId}`)).then((msgSnap) => {
                    if (!msgSnap.exists()) {
                        return;
                    }
                    
                    get(ref(db, `users/${currentUser.uid}/cleared_chats/${chatId}`)).then((clearSnap) => {
                        const clearTime = clearSnap.val() || 0;
                        let hasVisibleMsg = false;
                        
                        msgSnap.forEach((m) => {
                            const msg = m.val();
                            if (msg.timestamp > clearTime && !(msg.deletedBy && msg.deletedBy[currentUser.uid])) {
                                hasVisibleMsg = true;
                            }
                        });
                        
                        if (!hasVisibleMsg) {
                            return;
                        }
                        
                        if (document.getElementById(`item-${uid}`)) return;
                        
                        counts.strangers++;
                        
                        const div = document.createElement('div'); 
                        div.id = `item-${uid}`; 
                        div.className = `item ${activeChatId === chatId ? 'active' : ''}`;
                        
                        const acts = `<button class="btn-icon bg-success" title="Kết bạn" onclick="event.stopPropagation();updateStatus('${uid}','add_friend_stranger')">➕</button>
                                   <button class="btn-icon bg-secondary text-dark" title="Chặn" onclick="event.stopPropagation();updateStatus('${uid}','blocked')">🚫</button>
                                   <button class="btn-icon bg-danger" title="Xóa cuộc trò chuyện" onclick="event.stopPropagation();updateStatus('${uid}','delete_stranger_chat')">🗑</button>`;
                        
                        const verifiedHtml = data.haveGreenTick === true ? `<i class="fas fa-check-circle verified-icon" style="color: #1da1f2; margin-left: 4px;" title="Tài khoản đã được xác minh"></i>` : '';
                        const avatar = getAvatarDataFromUser(data);
                        const avatarHtml = avatar ? 
                            `<img src="${avatar}" class="item-avatar" style="width:36px; height:36px; border-radius:50%; object-fit:cover; margin-right:10px; flex-shrink:0;">` :
                            `<div class="item-avatar-placeholder" style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, var(--primary), #0056b3); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:14px; margin-right:10px; flex-shrink:0;">${(data.name || 'U').charAt(0).toUpperCase()}</div>`;
                        
                        div.innerHTML = `
                            <div style="display:flex; align-items:center; flex:1; min-width:0;">
                                ${avatarHtml}
                                <div class="item-info">
                                    <div class="name">${escapeHtml(data.name)}${verifiedHtml} <span class="badge bg-warning text-dark" style="font-size:8px;">Lạ</span></div>
                                    <div class="email">${escapeHtml(data.email)}</div>
                                </div>
                            </div>
                            <div class="btn-group">${acts}</div>
                        `;
                        div.onclick = () => { closeSidebar(); openChatFunction(uid, data.name, div); };
                        document.getElementById('stranger-list').appendChild(div);
                        
                        updateBadgeCounts(counts);
                    });
                });
            });
        });
    });
}

// ===== RENDER MESSAGES =====
async function renderMessages(snapshot, clearTime) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    
    box.innerHTML = "";
    
    const messages = [];
    const messageMap = {};
    const senderIds = new Set();
    
    snapshot.forEach(m => {
        const msg = m.val();
        const mid = m.key;
        if (msg.timestamp <= clearTime) return;
        if (msg.deletedBy && msg.deletedBy[currentUser.uid]) return;
        const messageObj = { id: mid, ...msg };
        messages.push(messageObj);
        messageMap[mid] = messageObj;
        if (msg.sender) senderIds.add(msg.sender);
    });
    
    const userPromises = [];
    senderIds.forEach(uid => {
        if (!userCache[uid]) {
            userPromises.push(
                get(ref(db, `users/${uid}`)).then(snap => {
                    if (snap.exists()) {
                        userCache[uid] = snap.val();
                    }
                }).catch(() => {})
            );
        }
    });
    await Promise.all(userPromises);
    
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    messages.forEach(msg => {
        const wrapper = document.createElement('div');
        const isOwn = msg.sender === currentUser.uid;
        wrapper.className = `msg-wrapper ${isOwn ? 'sent' : 'received'}`;
        wrapper.dataset.msgId = msg.id;
        wrapper.dataset.sender = msg.sender;
        wrapper.dataset.text = msg.text || '';
        wrapper.dataset.senderName = msg.senderName || 'Người dùng';
        if (msg.file) {
            wrapper.dataset.file = JSON.stringify(msg.file);
        }
        if (msg.revoked) {
            wrapper.dataset.revoked = 'true';
        }
        
        let content = '';
        let replyContent = '';
        
        if (msg.replyTo) {
            const replyData = msg.replyTo;
            const originalMsg = messageMap[replyData.id];
            const isOriginalRevoked = originalMsg && originalMsg.revoked === true;
            
            if (!isOriginalRevoked) {
                const replySenderName = replyData.sender === currentUser.uid ? 'Bạn' : (replyData.senderName || 'Người dùng');
                const contentText = replyData.text ? replyData.text.substring(0, 50) + (replyData.text.length > 50 ? '...' : '') : 
                                   (replyData.file ? `[${replyData.file.name}]` : 'Tin nhắn không có nội dung');
                replyContent = `
                    <div class="replied-msg">
                        <div class="reply-sender">${escapeHtml(replySenderName)}</div>
                        <div class="reply-text">${escapeHtml(contentText)}</div>
                    </div>
                `;
            }
        }
        
        if (msg.revoked === true) {
            content = `<i class="text-muted">Tin nhắn đã thu hồi</i>`;
        } else if (msg.files && msg.files.length > 0) {
            let filesHtml = '';
            msg.files.forEach(file => {
                filesHtml += renderFileMessage(file);
            });
            content = filesHtml;
        } else if (msg.file) {
            content = renderFileMessage(msg.file);
        } else {
            content = escapeHtml(msg.text || '');
        }
        
        let avatarHtml = '';
        if (!isOwn) {
            const userData = userCache[msg.sender] || {};
            avatarHtml = renderUserAvatar(msg.sender, userData, 36);
        }
        
        const swipeIndicator = `
            <div class="swipe-reply-indicator">
                <i class="fas fa-reply"></i>
            </div>
        `;
        
        if (msg.revoked === true) {
            const bubbleContent = `
                <div class="msg-content">
                    ${avatarHtml}
                    <div class="msg-bubble-wrapper">
                        <div class="msg-bubble"><i class="text-muted">Tin nhắn đã thu hồi</i></div>
                    </div>
                </div>
            `;
            wrapper.innerHTML = bubbleContent;
        } else {
            const bubbleContent = `
                ${!isOwn ? swipeIndicator : ''}
                <div class="msg-content">
                    ${isOwn ? swipeIndicator : ''}
                    ${avatarHtml}
                    <div class="msg-bubble-wrapper">
                        <div class="msg-bubble">${replyContent + content}</div>
                    </div>
                </div>
            `;
            wrapper.innerHTML = bubbleContent;
        }
        
        if (msg.revoked !== true) {
            wrapper.addEventListener('touchstart', function(e) {
                const touch = e.touches[0];
                swipeStartX = touch.clientX;
                swipeStartY = touch.clientY;
                swipeCurrentX = swipeStartX;
                swipeTargetMsg = this;
                swipeIsActive = false;
                
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }, { passive: true });
            
            wrapper.addEventListener('touchmove', function(e) {
                if (!swipeTargetMsg || msg.revoked) return;
                const touch = e.touches[0];
                const deltaX = touch.clientX - swipeStartX;
                const deltaY = touch.clientY - swipeStartY;
                
                if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
                    swipeIsActive = true;
                    swipeCurrentX = touch.clientX;
                    
                    const wrapperEl = swipeTargetMsg;
                    const isOwnMsg = wrapperEl.classList.contains('sent');
                    const indicator = wrapperEl.querySelector('.swipe-reply-indicator');
                    
                    if (indicator) {
                        let progress = 0;
                        if (!isOwnMsg) {
                            progress = Math.min(deltaX / swipeThreshold, 1);
                        } else {
                            progress = Math.min(-deltaX / swipeThreshold, 1);
                        }
                        
                        if (progress > 0.05) {
                            indicator.classList.add('show');
                            indicator.style.opacity = Math.min(progress * 1.5, 1);
                            wrapperEl.classList.add('swipe-reply-active');
                            
                            if (!isOwnMsg) {
                                indicator.style.transform = `translateX(${Math.min(deltaX, swipeThreshold)}px)`;
                            } else {
                                indicator.style.transform = `translateX(${Math.max(deltaX, -swipeThreshold)}px)`;
                            }
                        } else {
                            indicator.classList.remove('show');
                            indicator.style.opacity = '0';
                            wrapperEl.classList.remove('swipe-reply-active');
                        }
                    }
                }
            }, { passive: true });
            
            wrapper.addEventListener('touchend', function(e) {
                if (swipeTargetMsg && swipeIsActive) {
                    const wrapperEl = swipeTargetMsg;
                    const isOwnMsg = wrapperEl.classList.contains('sent');
                    const indicator = wrapperEl.querySelector('.swipe-reply-indicator');
                    const deltaX = swipeCurrentX - swipeStartX;
                    
                    let shouldReply = false;
                    if (!isOwnMsg) {
                        shouldReply = deltaX > swipeThreshold * 0.6;
                    } else {
                        shouldReply = -deltaX > swipeThreshold * 0.6;
                    }
                    
                    if (shouldReply && !msg.revoked) {
                        const msgId = wrapperEl.dataset.msgId;
                        const sender = wrapperEl.dataset.sender;
                        const text = wrapperEl.dataset.text;
                        const file = wrapperEl.dataset.file ? JSON.parse(wrapperEl.dataset.file) : null;
                        const senderName = wrapperEl.dataset.senderName || 'Người dùng';
                        
                        window.replyToMessage(msgId, sender, text, file, senderName);
                    }
                    
                    if (indicator) {
                        indicator.classList.remove('show');
                        indicator.style.opacity = '0';
                        indicator.style.transform = '';
                    }
                    wrapperEl.classList.remove('swipe-reply-active');
                }
                
                swipeTargetMsg = null;
                swipeIsActive = false;
                swipeStartX = 0;
                swipeStartY = 0;
                swipeCurrentX = 0;
            }, { passive: true });
            
            if (!isMobile) {
                const dotsBtn = document.createElement('button');
                dotsBtn.className = 'msg-options-btn';
                dotsBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
                dotsBtn.title = 'Tùy chọn';
                dotsBtn.dataset.msgId = msg.id;
                dotsBtn.dataset.sender = msg.sender;
                dotsBtn.dataset.text = msg.text || '';
                dotsBtn.dataset.senderName = msg.senderName || 'Người dùng';
                if (msg.file) {
                    dotsBtn.dataset.file = JSON.stringify(msg.file);
                }
                
                dotsBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const msgId = this.dataset.msgId;
                    const sender = this.dataset.sender;
                    const text = this.dataset.text;
                    const file = this.dataset.file ? JSON.parse(this.dataset.file) : null;
                    const senderName = this.dataset.senderName;
                    showContextMenuFromDots(e, msgId, sender, text, file, senderName, isOwn);
                });
                
                wrapper.appendChild(dotsBtn);
            }
        }
        
        wrapper.addEventListener('contextmenu', function(e) {
            if (msg.revoked) return;
            e.preventDefault();
            const senderName = msg.senderName || 'Người dùng';
            const fakeEvent = { 
                currentTarget: this, 
                preventDefault: () => {}, 
                stopPropagation: () => {},
                clientX: e.clientX || window.innerWidth / 2,
                clientY: e.clientY || window.innerHeight / 2
            };
            showContextMenuFromDots(fakeEvent, msg.id, msg.sender, msg.text || '', msg.file || null, senderName, isOwn);
        });
        
        wrapper.addEventListener('touchstart', function(e) {
            if (msg.revoked) return;
            longPressTimer = setTimeout(() => {
                e.preventDefault();
                const senderName = msg.senderName || 'Người dùng';
                const touch = e.touches[0];
                const fakeEvent = { 
                    currentTarget: this,
                    clientX: touch.clientX, 
                    clientY: touch.clientY, 
                    preventDefault: () => {}, 
                    stopPropagation: () => {} 
                };
                showContextMenuFromDots(fakeEvent, msg.id, msg.sender, msg.text || '', msg.file || null, senderName, isOwn);
            }, 500);
        }, { passive: true });
        wrapper.addEventListener('touchend', function() {
            clearTimeout(longPressTimer);
        });
        wrapper.addEventListener('touchmove', function() {
            clearTimeout(longPressTimer);
        });
        
        box.appendChild(wrapper);
    });
    
    setTimeout(() => {
        box.scrollTop = box.scrollHeight;
    }, 50);
}

// ===== LOAD MESSAGES =====
function loadMessages() {
    if (!activeChatId) return;
    
    const clearRef = ref(db, `users/${currentUser.uid}/cleared_chats/${activeChatId}`);
    const messagesRef = ref(db, `messages/${activeChatId}`);
    
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }
    if (currentClearListenerRef) {
        off(clearRef, currentClearListenerRef);
        currentClearListenerRef = null;
    }
    
    currentClearListenerRef = onValue(clearRef, (clearSnap) => {
        const clearTime = clearSnap.val() || 0;
        
        if (messagesUnsubscribe) {
            messagesUnsubscribe();
            messagesUnsubscribe = null;
        }
        
        messagesUnsubscribe = onValue(messagesRef, (snapshot) => {
            renderMessages(snapshot, clearTime);
        });
    });
}

// ===== OPEN CHAT =====
function openChatFunction(uid, name, el) {
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }
    cleanupChatListeners();
    
    resetChatUI(); 
    isChatActive = true; 
    currentChatUid = uid;
    
    document.querySelectorAll('.item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
    
    document.getElementById('home-btn-header').style.display = 'block';
    document.getElementById('delete-history-btn').style.display = 'inline-block';
    
    currentUserListenerRef = onValue(ref(db, `users/${uid}`), (uSnap) => {
        if (!isChatActive || currentChatUid !== uid) return;
        
        if (!uSnap.exists()) { 
            document.getElementById('input-container').style.display = 'none';
            ['banned-banner', 'block-banner', 'friend-request-banner'].forEach(id => document.getElementById(id).style.display = 'none');
            document.getElementById('deleted-banner').style.display = 'block'; 
            document.getElementById('header-text').innerText = "Tài khoản không khả dụng";
            return; 
        }
        
        const userData = uSnap.val();
        const verifiedHtml = userData.haveGreenTick === true ? ' <i class="fas fa-check-circle" style="color: #1da1f2; font-size: 14px;"></i>' : '';
        document.getElementById('header-text').innerHTML = `${escapeHtml(name || userData.name)}${verifiedHtml}`;
        
        if (userData.isLocked === true || userData.isLocked === "true") { 
            document.getElementById('input-container').style.display = 'none';
            ['deleted-banner', 'block-banner', 'friend-request-banner'].forEach(id => document.getElementById(id).style.display = 'none');
            document.getElementById('banned-banner').style.display = 'block'; 
            return; 
        }

        if (currentStatusListenerRef) off(ref(db, `friend_status`), currentStatusListenerRef);
        
        currentStatusListenerRef = onValue(ref(db, `friend_status`), (fsSnap) => {
            if (!isChatActive || currentChatUid !== uid) return;
            const myS = fsSnap.child(currentUser.uid).child(uid).val();
            const theirS = fsSnap.child(uid).child(currentUser.uid).val();

            document.getElementById('friend-request-banner').style.display = 'none';
            document.getElementById('friend-banner-actions').style.display = 'none';
            document.getElementById('block-banner').style.display = 'none';
            document.getElementById('deleted-banner').style.display = 'none';
            document.getElementById('banned-banner').style.display = 'none';
            document.getElementById('input-container').style.display = 'none';

            if (myS === 'blocked' || theirS === 'blocked') {
                const bBanner = document.getElementById('block-banner'); bBanner.style.display = 'block';
                bBanner.innerHTML = myS === 'blocked' ? `Bạn đang chặn đối phương <br> <button class="btn btn-light btn-sm mt-1" onclick="updateStatus('${uid}','unblock_stranger')">Bỏ chặn</button>` : `Bạn không thể liên lạc với người này.`;
            } else if (myS === 'accepted') {
                document.getElementById('input-container').style.display = 'flex';
            } else {
                if(userData.allowStrangerChat !== false) {
                    document.getElementById('input-container').style.display = 'flex';
                }
                
                if (myS === 'outgoing') {
                    document.getElementById('friend-request-banner').style.display = 'block';
                    document.getElementById('friend-banner-text').innerText = "Đang chờ họ chấp nhận lời mời kết bạn.";
                } else if (myS === 'incoming') {
                    document.getElementById('friend-request-banner').style.display = 'block';
                    document.getElementById('friend-banner-actions').style.display = 'flex';
                    document.getElementById('friend-banner-text').innerText = `${userData.name} muốn kết bạn với bạn`;
                    document.getElementById('banner-accept-btn').onclick = () => updateStatus(uid, 'accepted');
                    document.getElementById('banner-reject-btn').onclick = () => updateStatus(uid, 'reject');
                } else {
                    if(userData.allowStrangerChat !== false) {
                        document.getElementById('friend-request-banner').style.display = 'block';
                        document.getElementById('friend-banner-text').innerText = "Hai người chưa là bạn bè. Hãy kết bạn để có thể trò chuyện nhiều hơn";
                    } else {
                        document.getElementById('friend-request-banner').style.display = 'block';
                        document.getElementById('friend-banner-text').innerText = "Bạn không thể nhắn tin với người này do cài đặt quyền riêng tư của họ. Hãy kết bạn để trò chuyện";
                    }
                }
            }
        });
    });
    
    activeChatId = currentUser.uid < uid ? `${currentUser.uid}_${uid}` : `${uid}_${currentUser.uid}`;
    loadMessages();
}

// ===== REVOKE MSG =====
window.revokeMsg = async (msgId) => {
    closeContextMenu();
    
    if (!msgId) {
        showToast("Lỗi", "Không tìm thấy ID tin nhắn.", "error");
        return;
    }
    
    if (!activeChatId) {
        showToast("Lỗi", "Không tìm thấy cuộc trò chuyện.", "error");
        return;
    }
    
    try {
        const msgRef = ref(db, `messages/${activeChatId}/${msgId}`);
        const snap = await get(msgRef);
        if (!snap.exists()) {
            showToast("Lỗi", "Tin nhắn không tồn tại.", "error");
            return;
        }
        await update(msgRef, { revoked: true });
        showToast("Thành công", "Đã thu hồi tin nhắn.", "success");
    } catch (error) {
        console.error('Lỗi thu hồi:', error);
        showToast("Lỗi", "Không thể thu hồi tin nhắn. Vui lòng thử lại.", "error");
    }
};

// ===== DELETE MSG =====
window.deleteMsg = (msgId, isOwn) => {
    closeContextMenu();
    
    if (!msgId) {
        showToast("Lỗi", "Không tìm thấy ID tin nhắn.", "error");
        return;
    }
    
    if (!activeChatId) {
        showToast("Lỗi", "Không tìm thấy cuộc trò chuyện.", "error");
        return;
    }
    
    pendingDeleteMsgId = msgId;
    const modalEl = document.getElementById('deleteForMeModal');
    deleteForMeModalObj = new bootstrap.Modal(modalEl);
    deleteForMeModalObj.show();
};

document.getElementById('confirmDeleteForMeBtn').addEventListener('click', async function() {
    const msgId = pendingDeleteMsgId;
    if (!msgId) {
        showToast("Lỗi", "Không tìm thấy ID tin nhắn.", "error");
        return;
    }
    
    try {
        const msgRef = ref(db, `messages/${activeChatId}/${msgId}`);
        const snap = await get(msgRef);
        if (!snap.exists()) {
            showToast("Lỗi", "Tin nhắn không tồn tại.", "error");
            return;
        }
        await update(ref(db, `messages/${activeChatId}/${msgId}/deletedBy`), { [currentUser.uid]: true });
        
        if (deleteForMeModalObj) {
            deleteForMeModalObj.hide();
        }
        showToast("Thành công", "Đã xóa tin nhắn phía bạn!", "success");
    } catch (error) {
        console.error('Lỗi xóa:', error);
        showToast("Lỗi", "Không thể xóa tin nhắn. Vui lòng thử lại.", "error");
    }
    pendingDeleteMsgId = null;
});

// ===== SEND MESSAGE =====
window.sendMessage = async () => {
    const text = document.getElementById('message-input').value.trim();
    if (selectedFiles.length === 0 && !text) return;
    
    const myUid = currentUser.uid;
    const targetUid = currentChatUid;
    
    const myPath = `friend_status/${myUid}/${targetUid}`;
    const theirPath = `friend_status/${targetUid}/${myUid}`;
    
    try {
        const mySnap = await get(ref(db, myPath));
        if (!mySnap.exists()) {
            await set(ref(db, myPath), 'stranger');
        } else if (mySnap.val() === 'deleted_stranger') {
            await set(ref(db, myPath), 'stranger');
        }
        
        const theirSnap = await get(ref(db, theirPath));
        if (!theirSnap.exists()) {
            await set(ref(db, theirPath), 'stranger');
        } else if (theirSnap.val() === 'deleted_stranger') {
            await set(ref(db, theirPath), 'stranger');
        }
    } catch (error) {
        console.error('❌ Lỗi tạo friend_status:', error);
    }

    const senderName = document.getElementById('my-name').innerText.replace(/<[^>]*>/g, '');
    const replyData = replyToMessage ? {
        id: replyToMessage.id,
        sender: replyToMessage.sender,
        senderName: replyToMessage.name || 'Người dùng',
        text: replyToMessage.text || '',
        file: replyToMessage.file || null
    } : null;
    
    try {
        if (selectedFiles.length > 0) {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                const fileData = selectedFilesData[i];
                
                const fileMsgData = {
                    sender: currentUser.uid,
                    senderName: senderName,
                    text: '',
                    timestamp: serverTimestamp(),
                    revoked: false,
                    file: {
                        name: file.name,
                        size: file.size,
                        type: file.type || 'application/octet-stream',
                        data: fileData
                    }
                };
                
                if (replyData) {
                    fileMsgData.replyTo = replyData;
                }
                
                await push(ref(db, `messages/${activeChatId}`), fileMsgData);
            }
            
            clearAllFiles();
            
            if (text) {
                const textMsgData = {
                    sender: currentUser.uid,
                    senderName: senderName,
                    text: text,
                    timestamp: serverTimestamp(),
                    revoked: false
                };
                
                if (replyData) {
                    textMsgData.replyTo = replyData;
                }
                
                await push(ref(db, `messages/${activeChatId}`), textMsgData);
            }
            
            if (replyToMessage) cancelReply();
            document.getElementById('message-input').value = "";
        } else if (text) {
            const msgData = {
                sender: currentUser.uid,
                senderName: senderName,
                text: text,
                timestamp: serverTimestamp(),
                revoked: false
            };
            
            if (replyToMessage) {
                msgData.replyTo = {
                    id: replyToMessage.id,
                    sender: replyToMessage.sender,
                    senderName: replyToMessage.name || 'Người dùng',
                    text: replyToMessage.text || '',
                    file: replyToMessage.file || null
                };
                cancelReply();
            }
            
            await push(ref(db, `messages/${activeChatId}`), msgData);
            document.getElementById('message-input').value = "";
        }
        
        setTimeout(() => {
            syncLists();
        }, 300);
        
    } catch (error) {
        console.error('❌ Lỗi gửi tin nhắn:', error);
        showToast("Lỗi", "Không thể gửi tin nhắn. Vui lòng thử lại.", "error");
    }
};

// ===== GO HOME =====
window.goHome = () => { 
    isChatActive = false; 
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
        messagesUnsubscribe = null;
    }
    cleanupChatListeners(); 
    activeChatId = null; 
    currentChatUid = null; 
    resetChatUI(); 
    userCache = {};
};

// ===== CLEAR CHAT HISTORY =====
window.clearChatHistory = () => { 
    showConfirm("Xóa lịch sử chat?", async () => { 
        await set(ref(db, `users/${currentUser.uid}/cleared_chats/${activeChatId}`), Date.now()); 
        resetChatUI(); 
    }); 
};

// ===== SIDEBAR =====
window.closeSidebar = () => { document.getElementById('sidebar').classList.remove('open'); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function setupOutsideClick() { document.getElementById('chatWindow').onclick = (e) => { const sb = document.getElementById('sidebar'); if (sb.classList.contains('open') && !sb.contains(e.target)) window.closeSidebar(); }; }

// ===== EVENT LISTENERS =====
document.addEventListener('click', function(e) {
    const menu = document.getElementById('contextMenu');
    const sheet = document.getElementById('bottomSheet');
    const overlay = document.getElementById('contextOverlay');
    const dotsBtns = document.querySelectorAll('.msg-options-btn');
    
    if (overlay.style.display === 'block' && !menu.contains(e.target) && !sheet.contains(e.target)) {
        closeContextMenu();
    }
    
    if (!e.target.closest('.msg-options-btn')) {
        dotsBtns.forEach(btn => {
            btn.classList.remove('show');
        });
    }
});

document.addEventListener('mouseover', function(e) {
    const wrapper = e.target.closest('.msg-wrapper');
    if (wrapper && !isMobile) {
        const dotsBtn = wrapper.querySelector('.msg-options-btn');
        if (dotsBtn) {
            dotsBtn.classList.add('show');
        }
    }
});

document.addEventListener('mouseout', function(e) {
    const wrapper = e.target.closest('.msg-wrapper');
    if (wrapper && !isMobile) {
        const dotsBtn = wrapper.querySelector('.msg-options-btn');
        const isHoveringDots = document.querySelector('.msg-options-btn:hover');
        if (dotsBtn && !isHoveringDots) {
            setTimeout(() => {
                const stillHoveringDots = document.querySelector('.msg-options-btn:hover');
                if (!stillHoveringDots) {
                    dotsBtn.classList.remove('show');
                }
            }, 100);
        }
    }
});

// ===== PASSWORD STRENGTH REAL-TIME IN PRIVACY MODAL =====
document.getElementById('privNewPassword').addEventListener('input', function() {
    updatePasswordStrengthUI(this.value, 'privStrengthFill', 'privStrengthLabel', 'priv');
});

// ===== MOBILE VIEWPORT =====
function setMobileViewportHeight() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    const mainApp = document.getElementById('main-app');
    if (mainApp) mainApp.style.height = `${window.innerHeight}px`;
    const appContainer = document.querySelector('.app-container');
    if (appContainer) appContainer.style.height = `${window.innerHeight}px`;
    const chatWindow = document.getElementById('chatWindow');
    if (chatWindow) chatWindow.style.height = `${window.innerHeight}px`;
}

function handleKeyboardOnMobile() {
    const messageInput = document.getElementById('message-input');
    const chatMessages = document.getElementById('chat-messages');
    if (!messageInput) return;
    let originalHeight = window.innerHeight;
    messageInput.addEventListener('focus', function() {
        setTimeout(() => {
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    });
    window.addEventListener('resize', function() {
        const currentHeight = window.innerHeight;
        if (currentHeight < originalHeight) {
            setTimeout(() => {
                if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 100);
        } else if (currentHeight > originalHeight) {
            setMobileViewportHeight();
        }
        originalHeight = currentHeight;
    });
}

window.addEventListener('orientationchange', function() {
    setTimeout(setMobileViewportHeight, 100);
});

window.addEventListener('resize', function() {
    isMobile = window.innerWidth <= 790;
});

setTimeout(function() {
    setMobileViewportHeight();
    handleKeyboardOnMobile();
    document.getElementById('sidebarToggleBtn').onclick = (e) => { e.stopPropagation(); toggleSidebar(); };
    window.addEventListener('resize', () => { if(window.innerWidth > 790) window.closeSidebar(); });
}, 100);

// ===== CHECK ACTIVATION STATUS =====
async function checkActivationStatus() {
    if (!currentUser) return;
    
    const snap = await get(ref(db, `users/${currentUser.uid}`));
    if (!snap.exists()) return;
    
    const data = snap.val();
    const isActivated = data.haveGreenTick === true;
    
    const statusDiv = document.getElementById('activationStatus');
    const inputGroup = document.getElementById('activationInputGroup');
    const actionsDiv = document.getElementById('activationActions');
    
    if (isActivated) {
        statusDiv.innerHTML = `
            <div class="alert alert-success d-flex align-items-center" role="alert" style="border-radius: 10px;">
                <i class="fas fa-check-circle me-2" style="font-size: 20px; color: var(--success);"></i>
                <div>
                    <strong>✅ Đã kích hoạt tài khoản</strong>
                    <div class="small">Tài khoản của bạn đã được xác minh bởi VieChat Verified</div>
                </div>
            </div>
        `;
        inputGroup.style.display = 'none';
        actionsDiv.style.display = 'block';
    } else {
        statusDiv.innerHTML = `
            <div class="alert alert-secondary d-flex align-items-center" role="alert" style="border-radius: 10px;">
                <i class="fas fa-info-circle me-2" style="font-size: 20px; color: #6c757d;"></i>
                <div>
                    <strong>Chưa kích hoạt</strong>
                    <div class="small">Nhập mã kích hoạt bên dưới để xác minh tài khoản.</div>
                </div>
            </div>
        `;
        inputGroup.style.display = 'block';
        actionsDiv.style.display = 'none';
    }
}

// ===== ACTIVATE ACCOUNT =====
window.activateAccount = async () => {
    const codeInput = document.getElementById('activationCodeInput');
    const code = codeInput.value.trim();
    
    if (!code) {
        showToast('Lỗi', 'Vui lòng nhập mã kích hoạt.', 'error');
        return;
    }
    
    try {
        const codeSnap = await get(ref(db, 'code'));
        
        if (!codeSnap.exists()) {
            showToast('Lỗi', 'Mã kích hoạt không hợp lệ hoặc đã được sử dụng', 'error');
            return;
        }
        
        const allCodes = codeSnap.val();
        let foundKey = null;
        
        for (const [key, value] of Object.entries(allCodes)) {
            if (String(value) === code) {
                foundKey = key;
                break;
            }
        }
        
        if (!foundKey) {
            showToast('Lỗi', 'Mã kích hoạt không hợp lệ hoặc đã được sử dụng.', 'error');
            return;
        }
        
        await update(ref(db, `users/${currentUser.uid}`), {
            haveGreenTick: true,
            activatedAt: serverTimestamp(),
            activationCode: code
        });
        
        await remove(ref(db, `code/${foundKey}`));
        
        await checkActivationStatus();
        
        const userSnap = await get(ref(db, `users/${currentUser.uid}`));
        if (userSnap.exists()) {
            const data = userSnap.val();
            document.getElementById('my-name').innerHTML = getDisplayNameWithBadge(data.name || 'Người dùng', true);
        }
        
        codeInput.value = '';
        showToast('Thành công', 'Tài khoản của bạn đã được kích hoạt thành công!', 'success');
        
        setTimeout(() => {
            if (privacySettingsModalObj) {
                privacySettingsModalObj.hide();
                activeModalInstance = null;
            }
        }, 1500);
        
    } catch (error) {
        console.error('Lỗi kích hoạt:', error);
        showToast('Lỗi', 'Không thể kích hoạt tài khoản. Vui lòng thử lại.', 'error');
    }
};

// ===== DEACTIVATE ACCOUNT =====
window.deactivateAccount = async () => {
    showConfirm(
        `<div class="text-center">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--danger); display: block; margin-bottom: 15px;"></i>
            <p><strong>Bạn có chắc chắn muốn hủy kích hoạt?</strong></p>
            <p class="text-muted">Nếu hủy kích hoạt thì bạn sẽ không thể dùng mã cũ để kích hoạt nữa.</p>
            <p class="text-danger small">⚠️ Hành động này không thể hoàn tác!</p>
        </div>`,
        async () => {
            try {
                const userSnap = await get(ref(db, `users/${currentUser.uid}`));
                if (userSnap.exists()) {
                    const userData = userSnap.val();
                    const oldCode = userData.activationCode || null;
                    
                    if (oldCode) {
                        await remove(ref(db, `code/${oldCode}`)).catch(() => {});
                    }
                }
                
                await update(ref(db, `users/${currentUser.uid}`), {
                    haveGreenTick: false,
                    activatedAt: null,
                    activationCode: null
                });
                
                await checkActivationStatus();
                
                const updatedSnap = await get(ref(db, `users/${currentUser.uid}`));
                if (updatedSnap.exists()) {
                    const data = updatedSnap.val();
                    document.getElementById('my-name').innerHTML = getDisplayNameWithBadge(data.name || 'Người dùng', false);
                }
                
                showToast('Thông báo', 'Đã hủy kích hoạt tài khoản.', 'warning');
                
            } catch (error) {
                console.error('Lỗi hủy kích hoạt:', error);
                showToast('Lỗi', 'Không thể hủy kích hoạt. Vui lòng thử lại.', 'error');
            }
        }
    );
};

// ===== EXPORT FUNCTIONS =====
window.renderLinkAccountUI = renderLinkAccountUI;
window.unlinkProvider = unlinkProvider;
window.linkProvider = linkProvider;
window.saveSocialAvatar = saveSocialAvatar;

// ===== DOM CONTENT LOADED =====
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        document.getElementById('emailInput').focus();
    }, 500);
});

// ===== UPDATE PROFILE LINK IN PRIVACY MODAL =====
function updateProfileLinkInPrivacy(userId) {
    const anchor = document.getElementById('privProfileLinkAnchor');
    const display = document.getElementById('privProfileLinkDisplay');
    if (!anchor || !display) return;
    
    if (!userId) {
        anchor.textContent = 'Chưa có ID hồ sơ';
        anchor.href = '#';
        return;
    }
    
    const link = `https://vieconnect.github.io/viechat/profile-details.html?id=${userId}`;
    anchor.href = link;
    anchor.textContent = link;
    display.style.display = 'block';
}

// ===== OPEN PROFILE PAGE =====
window.openProfilePage = function() {
    const anchor = document.getElementById('privProfileLinkAnchor');
    if (!anchor || !anchor.href || anchor.href === '#') {
        showToast('Lỗi', 'Chưa có link hồ sơ để mở.', 'error');
        return;
    }
    
    window.open(anchor.href, '_blank');
};

// ===== UPDATE REFERRAL LINK IN PRIVACY MODAL =====
function updateReferralLinkInPrivacy(userId) {
    const anchor = document.getElementById('privReferralLinkAnchor');
    const display = document.getElementById('privReferralLinkDisplay');
    if (!anchor || !display) return;
    
    if (!userId) {
        anchor.textContent = 'Chưa có link giới thiệu';
        anchor.href = '#';
        return;
    }
    
    const link = `https://vieconnect.github.io/viechat/profile-details.html?id=${userId}`;
    anchor.href = link;
    anchor.textContent = link;
    display.style.display = 'block';
}

// ===== COPY REFERRAL LINK FROM PRIVACY =====
window.copyReferralLinkFromPrivacy = function() {
    const anchor = document.getElementById('privReferralLinkAnchor');
    if (!anchor || !anchor.href || anchor.href === '#') {
        showToast('Lỗi', 'Chưa có link giới thiệu để sao chép.', 'error');
        return;
    }
    
    const link = anchor.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
            showToast('Thành công', 'Đã sao chép link giới thiệu!', 'success');
        }).catch(() => {
            copyFallback(link);
        });
    } else {
        copyFallback(link);
    }
};

function copyFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showToast('Thành công', 'Đã sao chép link giới thiệu!', 'success');
    } catch (err) {
        showToast('Lỗi', 'Không thể sao chép link. Vui lòng copy thủ công.', 'error');
    }
    document.body.removeChild(textarea);
}

// =====================================================
// ===== CHỨC NĂNG XÓA TÀI KHOẢN VỚI THỜI GIAN CHỜ 7 NGÀY =====
// =====================================================

// ===== XÓA TÀI KHOẢN - LƯU TRỮ 7 NGÀY =====
window.deleteAccountWithGrace = async function() {
    const code = document.getElementById('privDeleteConfirmCode').value.trim();
    if (code !== "XOATOANBO") {
        showToast("Lỗi", 'Nhập "XOATOANBO" để xác nhận.', "error");
        return;
    }
    
    if (privacySettingsModalObj) {
        privacySettingsModalObj.hide();
        activeModalInstance = null;
    }
    
    showConfirm(
        `<div class="text-center">
            <i class="fas fa-exclamation-triangle" style="font-size:48px;color:var(--danger);display:block;margin-bottom:15px;"></i>
            <p><strong>Bạn có chắc chắn muốn xóa tài khoản?</strong></p>
            <p class="text-muted">Tài khoản sẽ bị <strong>vô hiệu hóa ngay lập tức</strong>.</p>
            <p class="text-warning"><i class="fas fa-clock me-1"></i> Bạn có <strong>7 ngày</strong> để khôi phục tài khoản bằng cách đăng nhập lại.</p>
            <p class="text-danger small">Sau 7 ngày, tài khoản sẽ bị xóa vĩnh viễn khỏi hệ thống.</p>
        </div>`,
        async () => {
            try {
                showLoading('Đang xử lý xóa tài khoản...');
                
                // ĐÁNH DẤU ĐANG XÓA TÀI KHOẢN
                isLoggingOut = true;
                
                const uid = currentUser.uid;
                const userSnap = await get(ref(db, `users/${uid}`));
                if (!userSnap.exists()) {
                    hideLoading();
                    isLoggingOut = false;
                    showToast("Lỗi", "Không tìm thấy tài khoản.", "error");
                    return;
                }
                
                const userData = userSnap.val();
                const deleteTime = Date.now();
                const expiryTime = deleteTime + (7 * 24 * 60 * 60 * 1000);
                
                // ==== LƯU THÔNG TIN VÀO deleted_users ====
                const deletedData = {
                    email: userData.email || currentUser.email,
                    name: userData.name || 'Người dùng',
                    data: userData,
                    deletedAt: deleteTime,
                    expiresAt: expiryTime,
                    status: 'pending_delete',
                    uid: uid
                };
                
                await set(ref(db, `deleted_users/${uid}`), deletedData);
                console.log('✅ Đã lưu thông tin xóa tài khoản vào deleted_users');
                
                // ==== XÓA SESSION TRƯỚC KHI XÓA USER ====
                // Truyền flag isDeletingAccount = true
                clearCurrentSession(true);
                
                // ==== XÓA USER KHỎI users (vô hiệu hóa) ====
                await remove(ref(db, `users/${uid}`));
                console.log('✅ Đã xóa user khỏi users');
                
                // ==== XÓA friend_status ====
                await remove(ref(db, `friend_status/${uid}`));
                console.log('✅ Đã xóa friend_status');
                
                // ==== ĐĂNG XUẤT ====
                await signOut(auth);
                
                hideLoading();
                isLoggingOut = false;
                
                showToast("Thông báo", "Tài khoản đã được vô hiệu hóa. Bạn có 7 ngày để khôi phục.", "warning");
                
                // Chuyển về trang đăng nhập với thông báo
                setTimeout(() => {
                    window.location.href = "index.html?restore=true";
                }, 1500);
                
            } catch (error) {
                hideLoading();
                isLoggingOut = false;
                console.error('Lỗi xóa tài khoản:', error);
                showToast("Lỗi", "Không thể xóa tài khoản. Vui lòng thử lại.", "error");
            }
        }
    );
};

// ===== KIỂM TRA VÀ KHÔI PHỤC TÀI KHOẢN =====
async function checkAndRestoreAccount(user) {
    if (!user) return;
    
    try {
        const uid = user.uid;
        
        const deletedSnap = await get(ref(db, `deleted_users/${uid}`));
        if (!deletedSnap.exists()) {
            return false;
        }
        
        const deletedData = deletedSnap.val();
        const now = Date.now();
        
        if (now > deletedData.expiresAt) {
            console.log('⏰ Tài khoản đã quá hạn 7 ngày, xóa vĩnh viễn...');
            await permanentDeleteAccount(uid);
            return false;
        }
        
        const remainingTime = deletedData.expiresAt - now;
        const days = Math.floor(remainingTime / (24 * 60 * 60 * 1000));
        const hours = Math.floor((remainingTime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
        
        let timeText = '';
        if (days > 0) {
            timeText = `${days} ngày ${hours} giờ`;
        } else if (hours > 0) {
            timeText = `${hours} giờ ${minutes} phút`;
        } else {
            timeText = `${minutes} phút`;
        }
        
        showRestoreBanner(deletedData.name || 'Người dùng', timeText, uid);
        return true;
        
    } catch (error) {
        console.error('Lỗi kiểm tra restore:', error);
        return false;
    }
}

// ===== HIỂN THỊ BANNER KHÔI PHỤC =====
function showRestoreBanner(name, timeText, uid) {
    let banner = document.getElementById('restoreBanner');
    
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'restoreBanner';
        banner.className = 'restore-banner';
        banner.innerHTML = `
            <div class="banner-title">🔄 Khôi phục tài khoản</div>
            <div class="banner-sub" id="restoreBannerText">Tài khoản "${name}" đã được yêu cầu xóa. Còn <strong>${timeText}</strong> để khôi phục.</div>
            <div class="btn-group-banner">
                <button class="btn-restore" onclick="restoreAccount()">✅ Khôi phục ngay</button>
                <button class="btn-delete-permanent" onclick="confirmPermanentDelete()">🗑️ Xóa vĩnh viễn</button>
            </div>
        `;
        document.body.appendChild(banner);
    } else {
        document.getElementById('restoreBannerText').innerHTML = 
            `Tài khoản "${name}" đã được yêu cầu xóa. Còn <strong>${timeText}</strong> để khôi phục.`;
        banner.classList.add('show');
    }
    
    setTimeout(() => {
        banner.classList.add('show');
    }, 100);
}

// ===== ẨN BANNER KHÔI PHỤC =====
function hideRestoreBanner() {
    const banner = document.getElementById('restoreBanner');
    if (banner) {
        banner.classList.remove('show');
        setTimeout(() => {
            if (banner.parentNode) {
                banner.parentNode.removeChild(banner);
            }
        }, 500);
    }
}

// ===== KHÔI PHỤC TÀI KHOẢN =====
window.restoreAccount = async function() {
    if (!currentUser) {
        showToast("Lỗi", "Vui lòng đăng nhập để khôi phục tài khoản.", "error");
        return;
    }
    
    try {
        showLoading('Đang khôi phục tài khoản...');
        
        const uid = currentUser.uid;
        const deletedSnap = await get(ref(db, `deleted_users/${uid}`));
        
        if (!deletedSnap.exists()) {
            hideLoading();
            showToast("Lỗi", "Không tìm thấy dữ liệu khôi phục.", "error");
            return;
        }
        
        const deletedData = deletedSnap.val();
        const now = Date.now();
        
        if (now > deletedData.expiresAt) {
            hideLoading();
            showToast("Lỗi", "Đã quá 7 ngày, không thể khôi phục tài khoản.", "error");
            await permanentDeleteAccount(uid);
            return;
        }
        
        const userData = deletedData.data || {};
        userData.restoredAt = now;
        userData.restoredFromDelete = true;
        userData.email = deletedData.email || currentUser.email;
        
        if (!userData.name) {
            userData.name = deletedData.name || 'Người dùng';
        }
        
        await set(ref(db, `users/${uid}`), userData);
        console.log('✅ Đã khôi phục user vào users');
        
        await remove(ref(db, `deleted_users/${uid}`));
        console.log('✅ Đã xóa khỏi deleted_users');
        
        document.getElementById('my-name').innerHTML = getDisplayNameWithBadge(userData.name || "Người dùng", userData.haveGreenTick === true);
        document.getElementById('my-email').innerText = userData.email || currentUser.email || 'Chưa có email';
        
        let avatar = getAvatarDataFromUser(userData);
        if (avatar) updateAvatarUI(avatar);
        
        hideRestoreBanner();
        
        hideLoading();
        showToast("Thành công", "Tài khoản đã được khôi phục!", "success");
        
        setTimeout(() => syncLists(), 500);
        
    } catch (error) {
        hideLoading();
        console.error('Lỗi khôi phục:', error);
        showToast("Lỗi", "Không thể khôi phục tài khoản. Vui lòng thử lại.", "error");
    }
};

// ===== XÓA VĨNH VIỄN TÀI KHOẢN =====
window.confirmPermanentDelete = async function() {
    showConfirm(
        `<div class="text-center">
            <i class="fas fa-exclamation-triangle" style="font-size:48px;color:var(--danger);display:block;margin-bottom:15px;"></i>
            <p><strong>Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản?</strong></p>
            <p class="text-danger small">Hành động này không thể hoàn tác! Tất cả dữ liệu sẽ bị xóa.</p>
        </div>`,
        async () => {
            if (!currentUser) {
                showToast("Lỗi", "Vui lòng đăng nhập để thực hiện.", "error");
                return;
            }
            
            try {
                showLoading('Đang xóa vĩnh viễn tài khoản...');
                await permanentDeleteAccount(currentUser.uid);
                hideLoading();
                
                clearCurrentSession();
                await signOut(auth);
                showToast("Thông báo", "Tài khoản đã được xóa vĩnh viễn.", "info");
                setTimeout(() => {
                    window.location.href = "index.html";
                }, 1500);
                
            } catch (error) {
                hideLoading();
                console.error('Lỗi xóa vĩnh viễn:', error);
                showToast("Lỗi", "Không thể xóa vĩnh viễn tài khoản.", "error");
            }
        }
    );
};

// ===== HÀM XÓA VĨNH VIỄN =====
async function permanentDeleteAccount(uid) {
    try {
        await remove(ref(db, `deleted_users/${uid}`)).catch(() => {});
        console.log('✅ Đã xóa khỏi deleted_users');
        
        await remove(ref(db, `users/${uid}`)).catch(() => {});
        console.log('✅ Đã xóa khỏi users');
        
        await remove(ref(db, `friend_status/${uid}`)).catch(() => {});
        console.log('✅ Đã xóa friend_status');
        
        const msgSnap = await get(ref(db, `messages`));
        if (msgSnap.exists()) {
            const allMessages = msgSnap.val();
            for (const chatId of Object.keys(allMessages)) {
                const parts = chatId.split('_');
                if (parts.length === 2 && (parts[0] === uid || parts[1] === uid)) {
                    await remove(ref(db, `messages/${chatId}`)).catch(() => {});
                    console.log(`✅ Đã xóa messages/${chatId}`);
                }
            }
        }
        
        try {
            if (auth.currentUser && auth.currentUser.uid === uid) {
                await deleteUser(auth.currentUser);
                console.log('✅ Đã xóa user khỏi Firebase Auth');
            }
        } catch (authError) {
            console.warn('⚠️ Không thể xóa user khỏi Auth:', authError);
        }
        
        console.log('✅ Đã xóa vĩnh viễn tài khoản:', uid);
        return true;
        
    } catch (error) {
        console.error('❌ Lỗi permanentDeleteAccount:', error);
        throw error;
    }
}

// ===== TỰ ĐỘNG XÓA TÀI KHOẢN QUÁ HẠN =====
async function autoCleanupExpiredAccounts() {
    try {
        console.log('🔄 Đang kiểm tra tài khoản quá hạn...');
        
        const deletedSnap = await get(ref(db, `deleted_users`));
        if (!deletedSnap.exists()) {
            console.log('✅ Không có tài khoản nào cần xóa.');
            return;
        }
        
        const allDeleted = deletedSnap.val();
        const now = Date.now();
        let deletedCount = 0;
        
        for (const [uid, data] of Object.entries(allDeleted)) {
            if (data.expiresAt && now > data.expiresAt) {
                console.log(`⏰ Xóa tài khoản quá hạn: ${uid} (${data.email || 'unknown'})`);
                try {
                    await permanentDeleteAccount(uid);
                    deletedCount++;
                } catch (error) {
                    console.error(`❌ Lỗi xóa tài khoản ${uid}:`, error);
                }
            }
        }
        
        if (deletedCount > 0) {
            console.log(`✅ Đã xóa ${deletedCount} tài khoản quá hạn.`);
        } else {
            console.log('✅ Không có tài khoản nào quá hạn.');
        }
        
    } catch (error) {
        console.error('❌ Lỗi autoCleanupExpiredAccounts:', error);
    }
}

// ===== KIỂM TRA RESTORE KHI ĐĂNG NHẬP =====
async function checkRestoreOnLogin(user) {
    if (!user) return;
    
    try {
        const uid = user.uid;
        const deletedSnap = await get(ref(db, `deleted_users/${uid}`));
        
        if (!deletedSnap.exists()) {
            return;
        }
        
        const deletedData = deletedSnap.val();
        const now = Date.now();
        
        if (now > deletedData.expiresAt) {
            console.log('⏰ Tài khoản đã quá hạn, xóa vĩnh viễn...');
            await permanentDeleteAccount(uid);
            await signOut(auth);
            window.location.href = "index.html?expired=true";
            return;
        }
        
        const remainingTime = deletedData.expiresAt - now;
        const days = Math.floor(remainingTime / (24 * 60 * 60 * 1000));
        const hours = Math.floor((remainingTime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        
        let timeText = '';
        if (days > 0) {
            timeText = `${days} ngày ${hours} giờ`;
        } else if (hours > 0) {
            timeText = `${hours} giờ`;
        } else {
            timeText = 'sắp hết hạn';
        }
        
        showRestoreBanner(deletedData.name || 'Người dùng', timeText, uid);
        
    } catch (error) {
        console.error('Lỗi checkRestoreOnLogin:', error);
    }
}

// ===== GHI ĐÈ HÀM deleteAccountFromPrivacy =====
window.deleteAccountFromPrivacy = window.deleteAccountWithGrace;

// ===== LẮNG NGHE THAY ĐỔI SESSION REALTIME =====
function listenToSessionsRealtime() {
    if (!currentUser) return;
    
    // Xóa listener cũ
    if (sessionsListenerRef) {
        off(sessionsListenerRef);
        sessionsListenerRef = null;
    }
    
    const sessionsRef = ref(db, `users/${currentUser.uid}/sessions`);
    sessionsListenerRef = onValue(sessionsRef, (snap) => {
        // Nếu đang đăng xuất chủ động, bỏ qua
        if (isLoggingOut) {
            return;
        }
        
        // Kiểm tra xem tab securitycheck có đang active không
        const activeSection = document.querySelector('.privacy-content .content-section.active');
        if (activeSection && activeSection.id === 'section-securitycheck') {
            renderDeviceList();
        }
    });
    
    console.log('✅ Đã thiết lập realtime listener cho sessions');
}

// ===== KHỞI TẠO AUTO CLEANUP =====
setInterval(() => {
    autoCleanupExpiredAccounts();
}, 6 * 60 * 60 * 1000);

setTimeout(() => {
    autoCleanupExpiredAccounts();
}, 5 * 60 * 1000);

console.log('✅ VieChat - Tất cả chức năng đã được tải thành công!');

// ===== KIỂM TRA TRẠNG THÁI ĐĂNG XUẤT TỪ XA KHI LOAD TRANG =====
function checkRemoteLogoutOnLoad() {
    const isRemoteLogout = localStorage.getItem('viechat_remote_logout') === 'true';
    if (isRemoteLogout) {
        // Xóa flag để không bị lặp
        localStorage.removeItem('viechat_remote_logout');
        // Chuyển về trang login
        window.location.href = 'index.html?remote_logout=true';
        return true;
    }
    return false;
}

// Gọi kiểm tra khi trang load
// Thêm vào đầu file hoặc sau khi định nghĩa các hàm
// checkRemoteLogoutOnLoad();

// ===== KIỂM TRA VÀ XỬ LÝ KHI TRANG LOAD =====
document.addEventListener('DOMContentLoaded', function() {
    // Kiểm tra flag remote logout - ƯU TIÊN CAO NHẤT
    const isRemoteLogout = localStorage.getItem('viechat_remote_logout') === 'true';
    if (isRemoteLogout) {
        console.log('🚫 Phát hiện remote logout khi load trang');
        // Xóa flag
        localStorage.removeItem('viechat_remote_logout');
        // Xóa tất cả dữ liệu liên quan
        localStorage.removeItem('viechat_current_session');
        localStorage.removeItem('viechat_device_id');
        localStorage.removeItem('viechat_userId');
        // Chuyển về trang login
        window.location.href = 'index.html?remote_logout=true';
        return;
    }
    
    // Focus vào email input nếu có
    setTimeout(() => {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) {
            emailInput.focus();
        }
    }, 500);
});

// ===== FIX PRIVACY MODAL HEIGHT - CHỈ ÁP DỤNG CHO PC =====
function adjustPrivacyModalHeight() {
    // CHỈ ÁP DỤNG CHO PC (width > 790px)
    // TRÊN MOBILE GIỮ NGUYÊN, KHÔNG LÀM GÌ CẢ
    if (window.innerWidth <= 790) {
        return;
    }
    
    const modal = document.querySelector('#privacySettingsModal');
    if (!modal) return;
    
    // Kiểm tra modal đang hiển thị
    if (!modal.classList.contains('show')) return;
    
    const modalContent = modal.querySelector('.modal-content');
    const modalBody = modal.querySelector('.modal-body');
    const header = modal.querySelector('.modal-header');
    const footer = modal.querySelector('.modal-footer');
    const sidebar = modal.querySelector('.privacy-sidebar');
    const content = modal.querySelector('.privacy-content');
    
    if (!modalContent || !modalBody) return;
    
    // Lấy chiều cao thực tế
    const winHeight = window.innerHeight;
    
    // Tính chiều cao tối đa cho modal (85% viewport)
    const maxModalHeight = Math.min(winHeight * 0.85, 850);
    const headerHeight = header ? header.offsetHeight : 60;
    const footerHeight = footer ? footer.offsetHeight : 60;
    const maxBodyHeight = maxModalHeight - headerHeight - footerHeight - 10;
    
    // ===== SET KÍCH THƯỚC CHO MODAL CONTENT =====
    modalContent.style.maxHeight = maxModalHeight + 'px';
    modalContent.style.height = maxModalHeight + 'px';
    modalContent.style.overflow = 'hidden';
    modalContent.style.display = 'flex';
    modalContent.style.flexDirection = 'column';
    
    // ===== SET KÍCH THƯỚC CHO MODAL BODY =====
    modalBody.style.maxHeight = maxBodyHeight + 'px';
    modalBody.style.height = maxBodyHeight + 'px';
    modalBody.style.overflow = 'hidden';
    modalBody.style.display = 'flex';
    modalBody.style.flexDirection = 'row';
    modalBody.style.flex = '1 1 auto';
    modalBody.style.minHeight = '0';
    
    // ===== SIDEBAR =====
    if (sidebar) {
        sidebar.style.maxHeight = maxBodyHeight + 'px';
        sidebar.style.height = '100%';
        sidebar.style.overflowY = 'auto';
        sidebar.style.flexShrink = '0';
        sidebar.style.minHeight = '0';
    }
    
    // ===== CONTENT =====
    if (content) {
        content.style.maxHeight = maxBodyHeight + 'px';
        content.style.height = '100%';
        content.style.overflowY = 'auto';
        content.style.flex = '1 1 auto';
        content.style.minHeight = '0';
        content.style.padding = '20px 24px';
        content.style.background = 'white';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
    }
    
    // ===== ACTIVE SECTION =====
    const activeSection = content ? content.querySelector('.content-section.active') : null;
    if (activeSection) {
        activeSection.style.height = '100%';
        activeSection.style.minHeight = '100%';
        activeSection.style.overflowY = 'auto';
        activeSection.style.paddingBottom = '20px';
        activeSection.style.display = 'block';
        activeSection.style.flex = '1 1 auto';
    }
    
    // ===== DEVICE LIST =====
    const deviceList = content ? content.querySelector('.device-list') : null;
    if (deviceList) {
        const sectionHeight = maxBodyHeight - 100;
        const listHeight = deviceList.scrollHeight;
        
        if (listHeight > sectionHeight) {
            deviceList.style.maxHeight = sectionHeight + 'px';
            deviceList.style.overflowY = 'auto';
        } else {
            deviceList.style.maxHeight = 'none';
            deviceList.style.overflowY = 'visible';
        }
    }
}

// ===== RESET KHI ĐÓNG MODAL - CHỈ TRÊN PC =====
function resetPrivacyModalStyles() {
    // CHỈ RESET TRÊN PC
    if (window.innerWidth <= 790) return;
    
    const modal = document.querySelector('#privacySettingsModal');
    if (!modal) return;
    
    const elements = modal.querySelectorAll('.modal-content, .modal-body, .privacy-content, .privacy-sidebar, .content-section, .device-list');
    elements.forEach(el => {
        el.style.cssText = '';
    });
    
    // Reset lại display cho content sections
    document.querySelectorAll('.privacy-content .content-section').forEach(content => {
        content.style.display = '';
        content.style.height = '';
        content.style.minHeight = '';
        content.style.overflowY = '';
        content.style.paddingBottom = '';
        content.style.flex = '';
    });
}

// ===== THEO DÕI KHI MODAL MỞ =====
document.addEventListener('shown.bs.modal', function (e) {
    if (e.target.id === 'privacySettingsModal') {
        // CHỈ FIX TRÊN PC
        if (window.innerWidth > 790) {
            setTimeout(adjustPrivacyModalHeight, 50);
            setTimeout(adjustPrivacyModalHeight, 150);
            setTimeout(adjustPrivacyModalHeight, 300);
            
            // Lắng nghe resize
            window.addEventListener('resize', adjustPrivacyModalHeight);
        }
    }
});

// ===== RESET KHI ĐÓNG MODAL =====
document.addEventListener('hidden.bs.modal', function (e) {
    if (e.target.id === 'privacySettingsModal') {
        resetPrivacyModalStyles();
        // Chỉ remove listener trên PC
        if (window.innerWidth > 790) {
            window.removeEventListener('resize', adjustPrivacyModalHeight);
        }
    }
});

// ===== GỌI KHI LOAD TRANG =====
window.addEventListener('load', function() {
    const modal = document.querySelector('#privacySettingsModal');
    if (modal && modal.classList.contains('show') && window.innerWidth > 790) {
        setTimeout(adjustPrivacyModalHeight, 200);
        setTimeout(adjustPrivacyModalHeight, 400);
    }
});

// ===== DEBOUNCE RESIZE =====
let resizeTimeout;
window.addEventListener('resize', function() {
    // CHỈ FIX TRÊN PC
    if (window.innerWidth > 790) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(adjustPrivacyModalHeight, 100);
    }
});

// ===== EXPORT =====
window.adjustPrivacyModalHeight = adjustPrivacyModalHeight;
window.resetPrivacyModalStyles = resetPrivacyModalStyles;

console.log('✅ Privacy Modal đã sẵn sàng (CHỈ PC, mobile giữ nguyên)');

// ===== AUTO FIX MODAL HEIGHT =====
function autoFixModalHeight() {
    // Chỉ áp dụng trên mobile
    if (window.innerWidth > 790) return;
    
    // Lấy tất cả modal đang mở
    const openModals = document.querySelectorAll('.modal.show');
    
    openModals.forEach(modal => {
        // Reset styles trước
        const content = modal.querySelector('.modal-content');
        const body = modal.querySelector('.modal-body');
        const header = modal.querySelector('.modal-header');
        const footer = modal.querySelector('.modal-footer');
        
        if (!content) return;
        
        // Tính toán chiều cao khả dụng
        const winHeight = window.innerHeight;
        const maxContentHeight = winHeight * 0.92;
        
        // Tính chiều cao header + footer
        let headerHeight = header ? header.offsetHeight : 0;
        let footerHeight = footer ? footer.offsetHeight : 0;
        
        // Nếu header/footer chưa có chiều cao, ước lượng
        if (headerHeight === 0) headerHeight = 60;
        if (footerHeight === 0) footerHeight = 60;
        
        // Chiều cao tối đa cho body
        const maxBodyHeight = maxContentHeight - headerHeight - footerHeight - 10;
        
        // Áp dụng
        content.style.maxHeight = maxContentHeight + 'px';
        content.style.height = 'auto';
        content.style.minHeight = 'auto';
        content.style.overflow = 'hidden';
        
        if (body) {
            body.style.maxHeight = maxBodyHeight + 'px';
            body.style.overflowY = 'auto';
            body.style.flex = '1 1 auto';
            body.style.minHeight = '0';
        }
        
        // Xử lý đặc biệt cho privacy modal
        if (modal.id === 'privacySettingsModal') {
            const sidebar = modal.querySelector('.privacy-sidebar');
            const privacyContent = modal.querySelector('.privacy-content');
            
            if (sidebar) {
                sidebar.style.maxHeight = '90px';
                sidebar.style.flexShrink = '0';
            }
            
            if (privacyContent) {
                privacyContent.style.maxHeight = (maxBodyHeight - 90) + 'px';
                privacyContent.style.overflowY = 'auto';
                privacyContent.style.flex = '1 1 auto';
                privacyContent.style.minHeight = '0';
            }
        }
    });
}

// ===== FIX MODAL KHI MỞ =====
function fixModalOnShow(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.addEventListener('shown.bs.modal', function() {
        // Fix ngay lập tức
        setTimeout(autoFixModalHeight, 50);
        setTimeout(autoFixModalHeight, 150);
        setTimeout(autoFixModalHeight, 350);
    });
    
    // Fix khi resize
    modal.addEventListener('shown.bs.modal', function() {
        const resizeHandler = function() {
            autoFixModalHeight();
        };
        window.addEventListener('resize', resizeHandler);
        
        modal.addEventListener('hidden.bs.modal', function() {
            window.removeEventListener('resize', resizeHandler);
        }, { once: true });
    });
}

// ===== GỌI FIX CHO TẤT CẢ MODAL =====
function fixAllModals() {
    // Danh sách tất cả modal trong app
    const modalIds = [
        'userInfoModal',
        'privacySettingsModal',
        'searchModal',
        'logoutConfirmModal',
        'commonModal',
        'confirmModal',
        'ageWarningModal',
        'avatarUploadModal',
        'aboutModal',
        'deleteForMeModal',
        'remoteLogoutModal'
    ];
    
    modalIds.forEach(id => {
        fixModalOnShow(id);
    });
}

// ===== FIX KHI WINDOW RESIZE =====
let resizeModalTimer = null;
window.addEventListener('resize', function() {
    // Chỉ fix trên mobile
    if (window.innerWidth > 790) return;
    
    clearTimeout(resizeModalTimer);
    resizeModalTimer = setTimeout(function() {
        // Kiểm tra có modal nào đang mở không
        const openModals = document.querySelectorAll('.modal.show');
        if (openModals.length > 0) {
            autoFixModalHeight();
        }
    }, 200);
});

// ===== FIX KHI ORIENTATION CHANGE =====
window.addEventListener('orientationchange', function() {
    setTimeout(function() {
        if (window.innerWidth <= 790) {
            const openModals = document.querySelectorAll('.modal.show');
            if (openModals.length > 0) {
                autoFixModalHeight();
            }
        }
    }, 400);
});

// ===== FIX KHI KEYBOARD MỞ/ĐÓNG TRÊN MOBILE =====
if ('visualViewport' in window) {
    let lastViewportHeight = window.visualViewport.height;
    
    window.visualViewport.addEventListener('resize', function() {
        const currentHeight = window.visualViewport.height;
        const heightDiff = Math.abs(currentHeight - lastViewportHeight);
        
        // Nếu thay đổi chiều cao đáng kể (> 100px) -> có thể do keyboard
        if (heightDiff > 100 && window.innerWidth <= 790) {
            setTimeout(function() {
                const openModals = document.querySelectorAll('.modal.show');
                if (openModals.length > 0) {
                    autoFixModalHeight();
                }
            }, 300);
        }
        
        lastViewportHeight = currentHeight;
    });
}

// ===== GHI ĐÈ HÀM SHOW MODAL =====
// Lưu hàm show modal gốc
const originalModalShow = bootstrap.Modal.prototype.show;

// Ghi đè để tự động fix
bootstrap.Modal.prototype.show = function() {
    // Gọi hàm show gốc
    originalModalShow.call(this);
    
    // Fix sau khi modal hiển thị
    const modalElement = this._element;
    if (modalElement) {
        setTimeout(function() {
            if (window.innerWidth <= 790) {
                autoFixModalHeight();
            }
        }, 100);
        
        // Lắng nghe sự kiện shown
        const onShown = function() {
            if (window.innerWidth <= 790) {
                setTimeout(autoFixModalHeight, 50);
                setTimeout(autoFixModalHeight, 150);
                setTimeout(autoFixModalHeight, 350);
            }
            modalElement.removeEventListener('shown.bs.modal', onShown);
        };
        modalElement.addEventListener('shown.bs.modal', onShown);
    }
};

// ===== KHỞI TẠO =====
document.addEventListener('DOMContentLoaded', function() {
    // Fix tất cả modal
    fixAllModals();
    
    // Fix modal hiện tại nếu có
    setTimeout(function() {
        if (window.innerWidth <= 790) {
            const openModals = document.querySelectorAll('.modal.show');
            if (openModals.length > 0) {
                autoFixModalHeight();
            }
        }
    }, 500);
});

console.log('✅ Modal auto-fix height initialized');
