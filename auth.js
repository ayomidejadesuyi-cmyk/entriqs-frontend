// 🔐 Global user session
window.userSession = {
    isAuthenticated: false,
    user: null
};

// 💾 Save session
function saveSession() {
    localStorage.setItem("userSession", JSON.stringify(userSession));
}

// 🔄 Restore session
function restoreSession() {
    try {
        const savedSession = localStorage.getItem("userSession");
        if (savedSession) {
            userSession = JSON.parse(savedSession);
        }
    } catch {
        clearSession();
    }
}

// 🔄 Restore session immediately on script load
restoreSession();

/* =========================
   🆔 UNIQUE ID SYSTEM
========================= */

/**
 * Generates a unique platform ID for a user.
 * Format: ATT-XXXXXXX (attendee) or ORG-XXXXXXX (organizer)
 * X = uppercase alphanumeric, 7 characters
 * Future-ready: prefix can be extended for new roles
 */
function generateUniqueId(role) {
    const prefix = role === "organizer" ? "ORG" : "ATT";
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I (ambiguous)
    let suffix = "";
    for (let i = 0; i < 7; i++) {
        suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${prefix}-${suffix}`;
}

/**
 * Ensures a user has a uniqueId. Safe to call on existing users —
 * will only generate if missing (backward compatibility).
 */
function ensureUniqueId(user) {
    if (!user || user.uniqueId) return user;
    user.uniqueId = generateUniqueId(user.role);
    return user;
}

/**
 * Look up any user across all stored sessions by their uniqueId.
 * Scans the global user registry in localStorage.
 * Returns the user object or null.
 */
function findUserByUniqueId(uniqueId) {
    if (!uniqueId) return null;
    try {
        const registry = JSON.parse(localStorage.getItem("entriqs_user_registry") || "{}");
        return registry[uniqueId] || null;
    } catch {
        return null;
    }
}

/**
 * Register a user into the global user registry so they can be
 * looked up by uniqueId from any account.
 * Stores only public-safe fields (no password).
 */
function registerUserInRegistry(user) {
    if (!user?.uniqueId) return;
    try {
        const registry = JSON.parse(localStorage.getItem("entriqs_user_registry") || "{}");
        registry[user.uniqueId] = {
            id:        user.id,
            uniqueId:  user.uniqueId,
            firstName: user.firstName || "",
            lastName:  user.lastName  || "",
            email:     user.email     || "",
            role:      user.role      || "attendee",
            initials:  user.initials  || ""
        };
        localStorage.setItem("entriqs_user_registry", JSON.stringify(registry));
    } catch (err) {
        console.warn("Failed to register user in registry", err);
    }
}

/* =========================
   🔔 NOTIFICATION SYSTEM
========================= */

/**
 * Get all notifications for a given userId.
 * Each notification: { id, type, fromUniqueId, fromName, ticketId,
 *   ticketName, eventName, status, createdAt }
 * status: "pending" | "accepted" | "declined"
 */
function getNotifications(userId) {
    if (!userId) return [];
    try {
        const key = `userNotifications_${userId}`;
        return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
        return [];
    }
}

function saveNotifications(userId, notifications) {
    if (!userId) return;
    localStorage.setItem(`userNotifications_${userId}`, JSON.stringify(notifications));
}

function getUnreadNotificationCount(userId) {
    return getNotifications(userId).filter(n => n.status === "pending").length;
}

/**
 * Send a transfer notification to a receiver.
 * Writes into the receiver's notification store.
 */
function sendTransferNotification({ toUserId, fromUser, ticket }) {
    if (!toUserId) return;
    const notifications = getNotifications(toUserId);
    notifications.unshift({
        id:           `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type:         "ticket_transfer",
        fromUniqueId: fromUser.uniqueId,
        fromName:     `${fromUser.firstName || ""} ${fromUser.lastName || ""}`.trim() || "Someone",
        ticketId:     ticket.id,
        ticketName:   ticket.ticketTier,
        eventName:    ticket.eventName,
        eventDate:    ticket.eventDate,
        status:       "pending",
        createdAt:    new Date().toISOString()
    });
    saveNotifications(toUserId, notifications);
}

function markNotificationRead(userId, notificationId) {
    const notifications = getNotifications(userId);
    const n = notifications.find(n => n.id === notificationId);
    if (n) n.read = true;
    saveNotifications(userId, notifications);
}

/* =========================
   🔔 NOTIFICATION BELL UI
========================= */

/**
 * Injects the notification bell into the nav for attendees.
 * Looks for #notificationBellSlot — a placeholder span in the nav.
 * Falls back gracefully if the slot isn't found.
 */
function renderNotificationBell() {
    const user = getCurrentUser();
    // Only show bell for attendees
    if (!user || user.role !== "attendee") return;

    const slot = document.getElementById("notificationBellSlot");
    if (!slot) return;

    const count = getUnreadNotificationCount(user.id);

    slot.innerHTML = `
        <div class="relative">
            <button
                id="notificationBellBtn"
                onclick="toggleNotificationDropdown(event)"
                class="relative w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                title="Notifications"
            >
                <iconify-icon icon="lucide:bell" width="18"></iconify-icon>
                ${count > 0 ? `
                <span id="notifBadge"
                    class="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-500 text-white text-[9px] font-bold
                           rounded-full flex items-center justify-center leading-none">
                    ${count > 9 ? "9+" : count}
                </span>` : `<span id="notifBadge" class="hidden"></span>`}
            </button>

            <!-- Notification Dropdown -->
            <div
                id="notificationDropdown"
                class="hidden absolute right-0 mt-2 w-80 bg-zinc-900 border border-white/10 rounded-xl
                       shadow-2xl z-50 overflow-hidden"
            >
                <div class="px-4 py-3 border-b border-white/10 flex justify-between items-center">
                    <span class="text-sm font-semibold text-white">Notifications</span>
                    ${count > 0 ? `<button onclick="markAllNotificationsRead()" class="text-[10px] text-zinc-500 hover:text-white">Mark all read</button>` : ""}
                </div>
                <div id="notificationList" class="max-h-80 overflow-y-auto">
                    <!-- Populated by renderNotificationList() -->
                </div>
            </div>
        </div>
    `;

    renderNotificationList();

    // Close on outside click
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#notificationBellBtn") &&
            !e.target.closest("#notificationDropdown")) {
            document.getElementById("notificationDropdown")?.classList.add("hidden");
        }
    });
}

function toggleNotificationDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById("notificationDropdown");
    if (!dropdown) return;
    dropdown.classList.toggle("hidden");
    if (!dropdown.classList.contains("hidden")) {
        renderNotificationList();
    }
}

function renderNotificationList() {
    const user = getCurrentUser();
    if (!user) return;

    const container = document.getElementById("notificationList");
    if (!container) return;

    const notifications = getNotifications(user.id);

    if (!notifications.length) {
        container.innerHTML = `
            <div class="py-10 text-center text-zinc-500 text-xs">
                <iconify-icon icon="lucide:bell-off" width="24" class="mb-2 block mx-auto text-zinc-700"></iconify-icon>
                No notifications yet
            </div>`;
        return;
    }

    container.innerHTML = notifications.map(n => {
        const isPending = n.status === "pending";
        const timeAgo   = formatTimeAgo(n.createdAt);

        return `
        <div class="px-4 py-3 border-b border-white/5 ${isPending ? "bg-indigo-500/5" : ""} hover:bg-white/3 transition-colors">
            <div class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30
                            flex items-center justify-center shrink-0 mt-0.5">
                    <iconify-icon icon="lucide:ticket" width="14" class="text-indigo-400"></iconify-icon>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs text-white font-medium leading-snug">
                        <span class="text-indigo-400">${n.fromName}</span>
                        wants to transfer a ticket to you
                    </p>
                    <p class="text-[11px] text-zinc-400 mt-0.5 truncate">${n.eventName} · ${n.ticketName}</p>
                    <p class="text-[10px] text-zinc-600 mt-1">${timeAgo}</p>

                    ${isPending ? `
                    <div class="flex gap-2 mt-2">
                        <button onclick="acceptTransferNotification('${n.id}')"
                            class="px-3 py-1 bg-white text-black text-[11px] font-bold rounded-lg hover:bg-zinc-200 transition-colors">
                            Accept
                        </button>
                        <button onclick="declineTransferNotification('${n.id}')"
                            class="px-3 py-1 border border-white/10 text-[11px] font-medium rounded-lg hover:bg-white/5 transition-colors">
                            Decline
                        </button>
                    </div>` : `
                    <p class="text-[10px] mt-1.5 font-semibold ${n.status === "accepted" ? "text-emerald-400" : "text-zinc-500"}">
                        ${n.status === "accepted" ? "✓ Accepted" : "✗ Declined"}
                    </p>`}
                </div>
            </div>
        </div>`;
    }).join("");
}

function markAllNotificationsRead() {
    const user = getCurrentUser();
    if (!user) return;
    const notifications = getNotifications(user.id).map(n => ({ ...n, read: true }));
    saveNotifications(user.id, notifications);
    refreshBellBadge();
    renderNotificationList();
}

function refreshBellBadge() {
    const user = getCurrentUser();
    if (!user) return;
    const count = getUnreadNotificationCount(user.id);
    const badge = document.getElementById("notifBadge");
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 9 ? "9+" : count;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

/**
 * Accept an incoming transfer — moves the ticket into this user's bookings,
 * removes it from the sender's bookings, updates notification status.
 */
function acceptTransferNotification(notificationId) {
    const user = getCurrentUser();
    if (!user) return;

    const notifications = getNotifications(user.id);
    const notif = notifications.find(n => n.id === notificationId);
    if (!notif) return;

    // Find sender in registry
    const sender = findUserByUniqueId(notif.fromUniqueId);
    if (!sender) {
        alert("Could not find the sender's account. Transfer cannot be completed.");
        return;
    }

    // Pull ticket from sender's bookings
    const senderKey    = `userBookings_${sender.id}`;
    const senderBookings = JSON.parse(localStorage.getItem(senderKey) || "[]");
    const ticketIndex  = senderBookings.findIndex(t => t.id === notif.ticketId);

    if (ticketIndex === -1) {
        alert("Ticket not found in sender's account. It may have been recalled.");
        return;
    }

    const ticket = { ...senderBookings[ticketIndex] };

    // Move ticket: remove from sender
    senderBookings.splice(ticketIndex, 1);
    localStorage.setItem(senderKey, JSON.stringify(senderBookings));

    // Add to receiver with updated ownership
    ticket.attendeeName   = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    ticket.attendeeEmail  = user.email;
    ticket.transferStatus = "confirmed";
    ticket.transferredFrom = notif.fromUniqueId;
    ticket.transferredDate = new Date().toISOString();
    delete ticket.transferTo;

    const receiverKey      = `userBookings_${user.id}`;
    const receiverBookings = JSON.parse(localStorage.getItem(receiverKey) || "[]");
    receiverBookings.push(ticket);
    localStorage.setItem(receiverKey, JSON.stringify(receiverBookings));

    // Update notification status
    notif.status = "accepted";
    saveNotifications(user.id, notifications);

    refreshBellBadge();
    renderNotificationList();

    // Refresh tickets if on attendee page
    if (typeof renderActiveTickets === "function") renderActiveTickets();
    if (typeof updateStats === "function") updateStats();

    // Show success inside dropdown (non-blocking)
    const list = document.getElementById("notificationList");
    if (list) {
        const flash = document.createElement("div");
        flash.className = "px-4 py-3 text-xs text-emerald-400 font-medium bg-emerald-500/10 border-b border-white/5";
        flash.textContent = `✓ Ticket for "${notif.eventName}" added to your account!`;
        list.prepend(flash);
        setTimeout(() => flash.remove(), 4000);
    }
}

/**
 * Decline a transfer — unlocks the ticket back to the sender.
 */
function declineTransferNotification(notificationId) {
    const user = getCurrentUser();
    if (!user) return;

    const notifications = getNotifications(user.id);
    const notif = notifications.find(n => n.id === notificationId);
    if (!notif) return;

    // Unlock the ticket on the sender's side
    const sender = findUserByUniqueId(notif.fromUniqueId);
    if (sender) {
        const senderKey      = `userBookings_${sender.id}`;
        const senderBookings = JSON.parse(localStorage.getItem(senderKey) || "[]");
        const ticket         = senderBookings.find(t => t.id === notif.ticketId);
        if (ticket) {
            ticket.transferStatus = null;
            delete ticket.transferTo;
            localStorage.setItem(senderKey, JSON.stringify(senderBookings));
        }
    }

    // Update notification status
    notif.status = "declined";
    saveNotifications(user.id, notifications);

    refreshBellBadge();
    renderNotificationList();
}

/* =========================
   🧠 SHARED IDENTITY HELPERS
========================= */

function getCurrentUser() {
    return userSession?.user || null;
}

function getUserInitials(user) {
    if (!user?.firstName && !user?.lastName && !user?.name) return "?";
    if (user.firstName || user.lastName) {
        return `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase();
    }
    if (user.name) {
        return user.name.split(" ").map(w => w[0]).join("").toUpperCase();
    }
    return "?";
}

function isOrganizer() {
    return getCurrentUser()?.role === "organizer";
}

function normalizeUserIdentity() {
    const user = getCurrentUser();
    if (!user) return;

    // Backward compatibility: split name into first/last
    if (!user.firstName && user.name) {
        const parts   = user.name.split(" ");
        user.firstName = parts[0] || "";
        user.lastName  = parts.slice(1).join(" ") || "";
    }

    // Ensure uniqueId exists (migration for existing accounts)
    ensureUniqueId(user);

    // Always keep initials updated
    user.initials = getUserInitials(user);

    saveSession();

    // Keep registry in sync
    registerUserInRegistry(user);
}

// 🔑 Auto-open login modal if redirected with #login
document.addEventListener("DOMContentLoaded", () => {
    if (window.location.hash === "#login") {
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
            loginModal.style.display = "flex";
        }
    }
});

// ❌ Clear session
function clearSession() {
    localStorage.removeItem("userSession");
    userSession = {
        isAuthenticated: false,
        user: null
    };
}

// 🎨 Update UI
function updateAuthUI() {
    normalizeUserIdentity();

    const loginBtn        = document.getElementById("loginBtn");
    const profileBtn      = document.getElementById("profileBtn");
    const profileDropdown = document.getElementById("profileDropdown");
    const isAuthed        = userSession.isAuthenticated && userSession.user;

    /* =========================
       AUTH VISIBILITY
    ========================== */

    if (isAuthed) {
        if (loginBtn) loginBtn.style.display = "none";
        if (profileBtn) profileBtn.classList.remove("hidden");

        if (profileDropdown) {
            const name  = document.getElementById("profileName");
            const email = document.getElementById("profileEmail");

            if (profileBtn) renderUserAvatar(profileBtn, userSession.user);
            if (name)  name.textContent  = `${userSession.user.firstName || ""} ${userSession.user.lastName || ""}`.trim();
            if (email) email.textContent = userSession.user.email;

            const dashboardLink = profileDropdown.querySelector('a[href="organizer-dashboard.html"]');
            if (dashboardLink) {
                dashboardLink.style.display = userSession.user.role === "organizer" ? "block" : "none";
            }
        }
    } else {
        if (loginBtn)        loginBtn.style.display = "inline-block";
        if (profileBtn)      profileBtn.classList.add("hidden");
        if (profileDropdown) profileDropdown.classList.add("hidden");
    }

    /* =========================
       ROLE-BASED NAV
    ========================== */

    const organizerLink         = document.getElementById("organizerLink");
    const attendeeLink          = document.getElementById("attendeeLink");
    const dropdownOrganizerLink = document.getElementById("dropdownOrganizerLink");
    const dropdownAttendeeLink  = document.getElementById("dropdownAttendeeLink");

    if (!isAuthed) {
        organizerLink?.classList.add("hidden");
        attendeeLink?.classList.add("hidden");
        dropdownOrganizerLink?.classList.add("hidden");
        dropdownAttendeeLink?.classList.add("hidden");
        return;
    }

    if (userSession.user.role === "organizer") {
        organizerLink?.classList.remove("hidden");
        attendeeLink?.classList.add("hidden");
        dropdownOrganizerLink?.classList.remove("hidden");
        dropdownAttendeeLink?.classList.add("hidden");

        // Hide "My Tickets" nav link on any page
        document.querySelectorAll('a[href="attendee.html"]').forEach(el => el.classList.add("hidden"));
    }

    if (userSession.user.role === "attendee") {
        attendeeLink?.classList.remove("hidden");
        organizerLink?.classList.add("hidden");
        dropdownAttendeeLink?.classList.remove("hidden");
        dropdownOrganizerLink?.classList.add("hidden");

        // Hide organizer dashboard links on any page
        document.querySelectorAll('a[href="organizer-dashboard.html"]').forEach(el => el.classList.add("hidden"));
    }

    /* =========================
       NOTIFICATION BELL
    ========================== */

    // Render bell after role-based nav is set
    renderNotificationBell();
    refreshBellBadge();

    /* =========================
       CREATE EVENT VISIBILITY
    ========================= */

    const createEventBtn = document.getElementById("openLogin");
    if (!userSession.isAuthenticated) {
        createEventBtn?.classList.remove("hidden");
    }
    if (userSession.user?.role === "organizer") {
        createEventBtn?.classList.remove("hidden");
    }
    if (userSession.user?.role === "attendee") {
        createEventBtn?.classList.add("hidden");
    }
}

function hydrateSharedIdentityUI() {
    const user = getCurrentUser();
    if (!user) return;

    const profileBtn = document.getElementById("profileBtn");
    const nameEl     = document.getElementById("profileName");
    const emailEl    = document.getElementById("profileEmail");

    if (profileBtn) renderUserAvatar(profileBtn, user);
    if (nameEl)  nameEl.textContent  = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User";
    if (emailEl) emailEl.textContent = user.email || "";

    // Render uniqueId badge wherever the slot exists
    renderUniqueIdBadge(user);
}

/**
 * Renders the uniqueId badge into any element with id="uniqueIdBadgeSlot".
 * Place this empty span wherever you want the badge to appear.
 */
function renderUniqueIdBadge(user) {
    const slot = document.getElementById("uniqueIdBadgeSlot");
    if (!slot || !user?.uniqueId) return;

    const colorClass = user.role === "organizer"
        ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
        : "bg-indigo-500/10 border-indigo-500/30 text-indigo-400";

    slot.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-semibold tracking-wider ${colorClass}"
              title="Your unique Entriqs ID">
            <iconify-icon icon="lucide:fingerprint" width="11"></iconify-icon>
            ${user.uniqueId}
        </span>
    `;
}

function logout() {
    clearSession();
    if (window.PAGE_MODE === "protected") {
        window.location.href = "index.html";
        return;
    }
    updateAuthUI();
}

function renderUserAvatar(el, user) {
    if (!el || !user) return;
    el.style.backgroundRepeat   = "no-repeat";
    el.style.backgroundPosition = "center";
    el.style.backgroundSize     = "cover";
    if (user.avatar) {
        el.style.backgroundImage = `url(${user.avatar})`;
        el.textContent = "";
    } else {
        el.style.backgroundImage = "none";
        el.textContent = user.initials || "?";
    }
}

/* =========================
   🔒 AUTH GUARDS
========================= */

function requireAuth(options = {}) {
    const role = options.role || window.REQUIRED_ROLE || null;
    if (!userSession.isAuthenticated || !userSession.user) {
        window.location.href = "index.html#login";
        return;
    }
    if (role && userSession.user.role !== role) {
        window.location.href = "index.html";
        return;
    }
}

/* =========================
   🛠 UTILITIES
========================= */

function formatTimeAgo(isoDate) {
    if (!isoDate) return "";
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)  return "just now";
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function migrateEventsToOrganizerIdOnly() {
    const raw = localStorage.getItem("entriqs_events");
    if (!raw) return;
    let events;
    try { events = JSON.parse(raw); }
    catch { console.warn("Failed to parse events for migration"); return; }

    let changed = false;
    Object.values(events).forEach(event => {
        if ("organizerName"     in event) { delete event.organizerName;     changed = true; }
        if ("organizerInitials" in event) { delete event.organizerInitials; changed = true; }
    });
    if (changed) {
        localStorage.setItem("entriqs_events", JSON.stringify(events));
        console.log("✅ Events migrated: organizerId-only enforced");
    }
}

// 🚀 Auth bootstrap (runs on every page)
document.addEventListener("DOMContentLoaded", () => {
    migrateEventsToOrganizerIdOnly();

    if (window.PAGE_MODE === "protected") {
        requireAuth();
    }

    updateAuthUI();
    hydrateSharedIdentityUI();
});