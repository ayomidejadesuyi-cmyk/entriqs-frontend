const API_URL = "https://entriqs-backend.onrender.com";

function getAuthHeaders() {
  const token = localStorage.getItem("entriqs_token");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

/* ===== TEMP EVENTS DATA (Mock backend) ===== */
const eventsData = {
  "event-1": {
    id: "event-1",
    organizerId: "organizer-123",
    name: "Neon Nights Festival",
    views: 1820,
    ticketsSold: 450,
    ticketLimit: 500,
    revenue: 2250000,
    clicks: 312
  },

  "event-2": {
    id: "event-2",
    organizerId: "organizer-123",
    name: "Underground Jazz",
    views: 740,
    ticketsSold: 120,
    ticketLimit: 120,
    revenue: 600000,
    clicks: 190
  }
};

/* =========================
   💾 LOCAL STORAGE LAYER
========================= */

const EVENTS_STORAGE_KEY = "entriqs_events";

function saveEventsToStorage() {
  localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(eventsData));
}

async function loadEventsFromStorage() {
  try {
    const res = await fetch(`${API_URL}/api/organizer/events`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return;
    const data = await res.json();
    data.events.forEach(event => {
      eventsData[event.id] = normalizeEventFromAPI(event);
    });
    renderEvents();
    hydrateOrganizerCard();
  } catch (err) {
    console.error("Failed to load events from API", err);
  }
}

function normalizeEventFromAPI(e) {
  return {
    id:                    e.id,
    organizerId:           e.organizer_id,
    name:                  e.name,
    date:                  e.event_date,
    location:              e.location,
    category:              e.category,
    description:           e.description,
    eventType:             e.event_type,
    eventSubtype:          e.event_subtype,
    eventFormat:           e.event_format,
    imageUrl:              e.image_url,
    tickets:               e.tickets || [],
    status:                e.status,
    views:                 e.views || 0,
    ticketsSold:           e.tickets_sold || 0,
    revenue:               e.revenue || 0,
    clicks:                0
  };
}

/* ===== FAKE API LAYER (Backend-ready) ===== */

function getAllEvents() {
  // Safety: if no logged-in user, return empty list
  if (!userSession || !userSession.user) {
    return {};
  }

  const organizerId = userSession.user.id;

  // Filter events that belong to this organizer
  const filteredEvents = {};

  Object.keys(eventsData).forEach(eventId => {
    const event = eventsData[eventId];

    if (event.organizerId === organizerId) {
      filteredEvents[eventId] = event;
    }
  });

  return filteredEvents;
}

function getEventById(eventId) {
  return eventsData[eventId];
}

async function updateEvent(eventId, updates) {
  try {
    const res = await fetch(`${API_URL}/api/organizer/events/${eventId}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name:        updates.name,
        date:        updates.date,
        location:    updates.location,
        category:    updates.category,
        description: updates.description,
        eventType:   updates.eventType,
        eventFormat: updates.eventFormat,
        imageUrl:    updates.imageUrl,
        tickets:     updates.tickets,
        status:      updates.status
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update event");

    eventsData[eventId] = normalizeEventFromAPI(data.event);
    saveEventsToStorage();
    return true;
  } catch (err) {
    console.error("Update event error", err);
    alert("Failed to update event: " + err.message);
    return false;
  }
}

async function deleteEvent(eventId) {
  try {
    const res = await fetch(`${API_URL}/api/organizer/events/${eventId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete event");
    }

    delete eventsData[eventId];
    saveEventsToStorage();
    return true;
  } catch (err) {
    console.error("Delete event error", err);
    alert("Failed to delete event: " + err.message);
    return false;
  }
}

async function createEvent(payload) {
  try {
    const res = await fetch(`${API_URL}/api/organizer/events`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name:        payload.name,
        date:        payload.date,
        location:    payload.location,
        category:    payload.category,
        description: payload.description,
        eventType:   payload.eventType,
        eventFormat: payload.eventFormat,
        imageUrl:    payload.imageUrl,
        tickets:     payload.tickets,
        status:      "published"
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create event");

    const event = normalizeEventFromAPI(data.event);
    eventsData[event.id] = event;
    saveEventsToStorage();
    return event.id;
  } catch (err) {
    console.error("Create event error", err);
    alert("Failed to create event: " + err.message);
    return null;
  }
}

/* =========================
   🎟️ TICKET TIERS MANAGEMENT
========================= */

// Global store for ticket tiers (before event is saved)
let ticketTiersStore = {};

function collectTicketTiers() {
  const tiers = [];

  document.querySelectorAll("#ticketTiersContainer > div").forEach((tierWrapper, index) => {
    const row = tierWrapper.querySelector(".grid");
    if (!row) return;

    const name = row.querySelector(".ticket-name")?.value.trim();
    const price = Number(row.querySelector(".ticket-price")?.value);
    const qty = Number(row.querySelector(".ticket-qty")?.value);

    if (!name || isNaN(price) || isNaN(qty)) return;

    // Use consistent tier ID based on index
    const tierId = `tier-index-${index}`;

    tiers.push({
      id: `tier-${Date.now()}-${index}`, // Unique ID for backend
      name,
      price,
      quantity: qty,
      sold: 0,
      ticketTemplate: ticketTiersStore[tierId] || null // 🔑 Attach saved template
    });
  });

  return tiers;
}

function addTicketTier() {
  const container = document.getElementById("ticketTiersContainer");

  const tierWrapper = document.createElement("div");
  tierWrapper.className = "space-y-2";

  tierWrapper.innerHTML = `
    <div class="grid grid-cols-12 gap-3 items-start">
      <div class="col-span-5 md:col-span-6">
        <input
          type="text"
          class="ticket-name w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          placeholder="Tier Name">
      </div>

      <div class="col-span-3 md:col-span-3">
        <div class="relative">
          <span class="absolute left-3 top-2 text-zinc-500 text-xs">#</span>
          <input
            type="number"
            class="ticket-price w-full bg-zinc-950 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white tabular-nums"
            placeholder="0.00">
        </div>
      </div>

      <div class="col-span-3 md:col-span-2">
        <div class="relative">
          <iconify-icon icon="lucide:users" class="absolute left-3 top-2.5 text-zinc-600" width="12"></iconify-icon>
          <input
            type="number"
            class="ticket-qty w-full bg-zinc-950 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white tabular-nums"
            placeholder="Qty">
        </div>
      </div>

      <div class="col-span-1 md:col-span-1 flex items-center justify-center pt-2">
        <button
          type="button"
          onclick="removeTicketTier(this)"
          class="text-zinc-600 hover:text-red-400 transition-colors">
          <iconify-icon icon="lucide:trash-2" width="16"></iconify-icon>
        </button>
      </div>
    </div>

    <div class="flex justify-end">
      <button
        type="button"
        class="text-xs text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
        data-tier-action="configure-template"
        data-tier-index="">
        <iconify-icon icon="lucide:palette" width="12"></iconify-icon>
        Configure Ticket Design
      </button>
    </div>
  `;

  container.appendChild(tierWrapper);
}

function removeTicketTier(button) {
  const tierWrapper = button.closest("#ticketTiersContainer > div");
  if (tierWrapper) tierWrapper.remove();
}

/* =========================
   🎟️ TICKET TEMPLATE STATE
========================= */

let currentEditingTierIndex = null;
let currentTicketTemplate = {
  backgroundImage: null,
  labels: []
};

/* =========================
   🖼️ IMAGE UPLOAD STATE
========================= */

let selectedEventImage = null; // Base64 image

/* =========================
   Ticket Aggregation Helpers
========================= */
function getTicketCapacity(event) {
  if (!event.tickets || !event.tickets.length) return 0;

  return event.tickets.reduce((sum, tier) => {
    return sum + (Number(tier.quantity) || 0);
  }, 0);
}

function getTicketsSold(event) {
  if (!event.tickets || !event.tickets.length) return 0;

  return event.tickets.reduce((sum, tier) => {
    return sum + (Number(tier.sold) || 0);
  }, 0);
}

/* =========================
   📊 CHART DATA HELPERS
========================= */

function generateTrendData(total, points = 7) {
  if (!total || total === 0) {
    return Array(points).fill(0);
  }

  const data = [];
  let accumulated = 0;

  for (let i = 0; i < points; i++) {
    const remaining = total - accumulated;
    const increment =
      i === points - 1
        ? remaining
        : Math.round(remaining / (points - i));

    accumulated += increment;
    data.push(accumulated);
  }

  return data;
}

function renderEmptyEventsState() {
  const list = document.getElementById("eventsList");

  list.innerHTML = `
    <div class="p-12 flex flex-col items-center justify-center text-center gap-4">
      <div class="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
        <iconify-icon icon="lucide:calendar-x" width="24"></iconify-icon>
      </div>

      <div>
        <h4 class="text-sm font-semibold text-white">
          No events yet
        </h4>
        <p class="text-xs text-zinc-500 mt-1">
          Create your first event to start selling tickets
        </p>
      </div>
    </div>
  `;
}

let currentFilter = "all";

function setFilter(filter) {
  currentFilter = filter;
  renderEvents();
}

function renderEvents() {
  const list = document.getElementById("eventsList");
  list.innerHTML = "";

  const events = getAllEvents();
  let eventIds = Object.keys(events);

  // Apply filter
  if (currentFilter === "drafts") {
    eventIds = eventIds.filter(id => events[id].status === "draft");
  } else {
    eventIds = eventIds.filter(id => events[id].status !== "draft");
  }

  if (eventIds.length === 0) {
    renderEmptyEventsState();
    return;
  }

  eventIds.forEach(eventId => {
    const event = events[eventId];
    const isDraft = event.status === "draft";
    const capacity = getTicketCapacity(event);
    const sold = getTicketsSold(event);
    const soldPercent = capacity ? Math.min((sold / capacity) * 100, 100) : 0;

    list.innerHTML += `
      <div class="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/5 transition-colors group">
        <div class="flex items-center gap-4 min-w-0">
          <div class="w-12 h-12 rounded bg-zinc-800 overflow-hidden shrink-0">
            ${event.imageUrl ? `<img src="${event.imageUrl}" class="w-full h-full object-cover">` : ""}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h4 class="text-sm font-medium text-white truncate">${event.name}</h4>
              ${isDraft ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-wider font-semibold">Draft</span>` : ""}
            </div>
            <p class="text-xs text-zinc-500 truncate">${sold} / ${capacity} tickets</p>
          </div>
        </div>

        <div class="flex items-center gap-6 md:pl-0 pl-16 justify-between md:justify-end w-full md:w-auto">
          <div class="text-right hidden sm:block">
            <span class="text-xs font-mono text-zinc-400 block">${sold} / ${capacity}</span>
            <div class="w-20 h-1 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
              <div class="h-full bg-emerald-500" style="width:${soldPercent}%"></div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            ${isDraft ? `
            <button onclick="publishDraft('${eventId}')"
              class="h-8 px-3 rounded border border-white/10 flex items-center gap-2 text-xs font-medium hover:bg-white hover:text-black">
              Publish
            </button>` : event.eventSubtype === "invite_only" ? `
            <button onclick="openManageInvites('${eventId}')"
              class="h-8 px-3 rounded border border-white/10 flex items-center gap-2 text-xs font-medium hover:bg-white hover:text-black">
              <iconify-icon icon="lucide:users" width="13"></iconify-icon>
              Invites
            </button>` : `
            <button onclick="openStats('${eventId}')"
              class="h-8 px-3 rounded border border-white/10 flex items-center gap-2 text-xs font-medium hover:bg-white hover:text-black">
              Stats
            </button>`}

            <button onclick="shareEvent('${eventId}')"
              class="h-8 w-8 rounded border border-white/10 flex items-center justify-center text-zinc-400 hover:bg-indigo-500 hover:text-white transition-colors">
              <iconify-icon icon="lucide:share-2" width="14"></iconify-icon>
            </button>
            <button onclick="editEvent('${eventId}')"
              class="h-8 w-8 rounded border border-white/10 flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white">✏️</button>
            <button onclick="confirmDelete('${eventId}', this)"
              class="h-8 w-8 rounded border border-white/10 flex items-center justify-center text-zinc-400 hover:text-red-400">🗑️</button>
          </div>
        </div>
      </div>
    `;
  });
}

async function publishDraft(eventId) {
  const success = await updateEvent(eventId, { status: "published" });
  if (success) {
    renderEvents();
    hydrateOrganizerCard();
    alert("Event published!");
  }
}

let currentEditingEventId = null;
let eventToDeleteId = null;
let eventToDeleteElement = null;

function selectEventType(button) {
  document.querySelectorAll('.event-type-option').forEach(btn => {
    btn.classList.remove('selected');
  });

  button.classList.add('selected');
  document.getElementById('eventType').value = button.dataset.type;
}

function selectEventFormat(button) {
  document.querySelectorAll('[data-format]').forEach(btn => {
    btn.classList.remove('selected');
  });

  button.classList.add('selected');
  document.getElementById('eventFormat').value = button.dataset.format;
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

async function confirmDelete(eventId, buttonEl) {
  eventToDeleteId = eventId;
  eventToDeleteElement = buttonEl.closest(".group");
  const confirmed = confirm("Are you sure you want to delete this event?");
  if (!confirmed) return;
  const success = await deleteEvent(eventId);
  if (success) {
    renderEvents();
    alert("Event deleted");
  }
  eventToDeleteId = null;
  eventToDeleteElement = null;
}

function openStats(eventId) {
  const data = getEventById(eventId);
  if (!data) return;

  // Inject stats into modal
  document.getElementById("statsEventName").innerText = data.name;
  document.getElementById("statsViews").innerText = data.views;

  const capacity = getTicketCapacity(data);
  const sold = getTicketsSold(data);

  document.getElementById("statsTickets").innerText =
    `${sold} / ${capacity}`;

  document.getElementById("statsRevenue").innerText =
    `₦${data.revenue.toLocaleString()}`;

  /* ===== CHART CODE START ===== */
  const ctx = document.getElementById("statsChart");

  if (window.statsChartInstance) {
    window.statsChartInstance.destroy();
  }

  const salesTrend = generateTrendData(sold);

  window.statsChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      datasets: [{
        data: salesTrend, // 🔑 DATA-DRIVEN
        borderColor: "#6366f1",
        backgroundColor: "rgba(99,102,241,0.15)",
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "#71717a" },
          grid: { display: false }
        },
        y: {
          ticks: { color: "#71717a" },
          grid: { color: "rgba(255,255,255,0.05)" }
        }
      }
    }
  });
  /* ===== CHART CODE END ===== */

  openModal("statsModal");
}

/* =========================
   💌 MANAGE INVITES
========================= */

let currentManageInvitesEventId = null;

async function openManageInvites(eventId) {
  const event = getEventById(eventId);
  if (!event) return;

  currentManageInvitesEventId = eventId;
  document.getElementById("manageInvitesEventName").textContent = event.name;

  // Reset state
  document.getElementById("invitesList").innerHTML = `
    <div class="p-8 text-center text-zinc-500 text-sm">
      <iconify-icon icon="lucide:loader" class="animate-spin" width="20"></iconify-icon>
      <p class="mt-2">Loading invites...</p>
    </div>`;
  document.getElementById("inviteSummaryTotal").textContent    = "0";
  document.getElementById("inviteSummaryAccepted").textContent = "0";
  document.getElementById("inviteSummaryDeclined").textContent = "0";

  // Show modal
  document.getElementById("manageInvitesModal").classList.remove("hidden");

  // Fetch invites
  try {
    const res  = await fetch(`${API_URL}/api/organizer/invites/${eventId}`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load invites");

    renderInvitesList(data.invites, data.summary);
  } catch (err) {
    console.error("Load invites error:", err);
    document.getElementById("invitesList").innerHTML = `
      <div class="p-8 text-center text-zinc-500 text-sm">
        Failed to load invites
      </div>`;
  }
}

function closeManageInvites() {
  document.getElementById("manageInvitesModal").classList.add("hidden");
  currentManageInvitesEventId = null;
}

function renderInvitesList(invites, summary) {
  // Update summary
  document.getElementById("inviteSummaryTotal").textContent    = summary.total;
  document.getElementById("inviteSummaryAccepted").textContent = summary.accepted;
  document.getElementById("inviteSummaryDeclined").textContent = summary.declined;

  const container = document.getElementById("invitesList");

  if (!invites.length) {
    container.innerHTML = `
      <div class="p-8 text-center">
        <p class="text-zinc-500 text-sm">No invites found for this event</p>
      </div>`;
    return;
  }

  const roleBadgeColors = {
    VIP:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Speaker: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    Staff:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Guest:   "bg-zinc-800 text-zinc-300 border-white/10",
    Custom:  "bg-purple-500/15 text-purple-400 border-purple-500/30"
  };

  const statusConfig = {
    pending:  { color: "text-amber-400",  bg: "bg-amber-500/10  border-amber-500/20",  icon: "lucide:clock"        },
    accepted: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: "lucide:check-circle" },
    declined: { color: "text-zinc-400",   bg: "bg-zinc-800      border-white/10",       icon: "lucide:x-circle"     }
  };

  container.innerHTML = invites.map(invite => {
    const status  = statusConfig[invite.status] || statusConfig.pending;
    const initials = invite.full_name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    const roleColor = roleBadgeColors[invite.role] || roleBadgeColors["Guest"];
    const inviteLink = `${window.location.origin}/invite.html?token=${invite.token}`;

    return `
      <div class="p-4 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors group">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-bold text-white shrink-0">
            ${initials}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-white">${invite.full_name}</span>
              ${invite.role ? `<span class="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border font-medium ${roleColor}">${invite.role}</span>` : ""}
            </div>
            <p class="text-xs text-zinc-500 truncate mt-0.5">${invite.email}</p>
            ${invite.seat ? `<p class="text-[10px] text-zinc-600 mt-0.5">${invite.seat}</p>` : ""}
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Status badge -->
          <span class="px-2 py-1 rounded-lg text-[10px] uppercase tracking-wider border font-medium flex items-center gap-1 ${status.bg} ${status.color}">
            <iconify-icon icon="${status.icon}" width="10"></iconify-icon>
            ${invite.status}
          </span>

          <!-- Copy link -->
          <button
            onclick="copyInviteLink('${inviteLink}', this)"
            class="h-8 w-8 rounded border border-white/10 flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Copy invite link">
            <iconify-icon icon="lucide:link" width="14"></iconify-icon>
          </button>

          <!-- Resend -->
          <button
            onclick="resendInvite('${invite.id}', this)"
            class="h-8 px-3 rounded border border-white/10 flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
            title="Resend invite">
            <iconify-icon icon="lucide:send" width="12"></iconify-icon>
            Resend
          </button>
        </div>
      </div>`;
  }).join("");
}

async function resendInvite(inviteId, btn) {
  // Check cooldown
  const cooldownKey = `resend_cooldown_${inviteId}`;
  const lastSent    = localStorage.getItem(cooldownKey);
  const TWO_HOURS   = 2 * 60 * 60 * 1000;

  if (lastSent && Date.now() - parseInt(lastSent) < TWO_HOURS) {
    startResendCountdown(inviteId, btn, parseInt(lastSent));
    return;
  }

  const original  = btn.innerHTML;
  btn.disabled    = true;
  btn.innerHTML   = `<iconify-icon icon="lucide:loader" class="animate-spin" width="12"></iconify-icon>`;

  try {
    const res  = await fetch(`${API_URL}/api/organizer/invites/${inviteId}/resend`, {
      method: "POST",
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Store timestamp and start countdown
    localStorage.setItem(cooldownKey, Date.now().toString());
    startResendCountdown(inviteId, btn, Date.now());

  } catch (err) {
    btn.innerHTML = original;
    btn.disabled  = false;
    alert("Failed to resend invite");
  }
}

function startResendCountdown(inviteId, btn, sentAt) {
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  function update() {
    const elapsed   = Date.now() - sentAt;
    const remaining = TWO_HOURS - elapsed;

    if (remaining <= 0) {
      btn.disabled  = false;
      btn.innerHTML = `<iconify-icon icon="lucide:send" width="12"></iconify-icon> Resend`;
      localStorage.removeItem(`resend_cooldown_${inviteId}`);
      return;
    }

    const hrs  = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    btn.disabled  = true;
    btn.innerHTML = `<iconify-icon icon="lucide:clock" width="12"></iconify-icon> ${hrs}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
    btn.classList.add("text-zinc-600");

    setTimeout(update, 1000);
  }

  update();
}

function copyInviteLink(link, btn) {
  navigator.clipboard.writeText(link).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = `<iconify-icon icon="lucide:check" width="14"></iconify-icon>`;
    btn.classList.add("text-emerald-400");
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove("text-emerald-400");
    }, 2000);
    showToast("Invite link copied!");
  });
}

function collectFormData(form) {
  const dateInput = form.elements["eventDate"]?.value;
  const timeInput = form.elements["eventTime"]?.value;
  return {
    name: form.elements["eventName"].value.trim(),
    date: dateInput && timeInput ? `${dateInput}T${timeInput}` : "",
    location: form.elements["location"].value.trim(),
    category: form.elements["category"].value.trim(),
    description: form.elements["description"].value.trim(),
    eventType: document.getElementById('eventType').value,
    eventFormat: document.getElementById('eventFormat').value,
    imageUrl: selectedEventImage,
    tickets: collectTicketTiers()
  };
}

async function handleEventSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const payload = collectFormData(form);

  if (!payload.name) {
    alert("Event name is required");
    return;
  }

  if (currentEditingEventId) {
    await updateEvent(currentEditingEventId, {
      name:        payload.name,
      date:        payload.date,
      location:    payload.location,
      category:    payload.category,
      description: payload.description,
      eventType:   payload.eventType,
      eventFormat: payload.eventFormat,
      imageUrl:    payload.imageUrl,
      tickets:     payload.tickets
    });
    alert("Event updated!");
  } else {
    await createEvent(payload);
    alert("Event created!");
  }

  currentEditingEventId = null;
  renderEvents();
  hydrateOrganizerCard();

  form.reset();
  removeImage();
  ticketTiersStore = {};
}

async function handleSaveDraft(form) {
  const payload = collectFormData(form);

  if (!payload.name) {
    alert("Please enter at least an event name before saving as draft");
    return;
  }

  await saveDraft(payload);
  renderEvents();
  hydrateOrganizerCard();
  alert("Draft saved!");

  currentEditingEventId = null;
  form.reset();
  removeImage();
  ticketTiersStore = {};
}

function openCreateEventForm() {
  closeEditModal();
  currentEditingEventId = null;

  // Reset all fields
  document.getElementById("ol_eventName").value = "";
  document.getElementById("ol_eventDate").value = "";
  document.getElementById("ol_eventTime").value = "";
  document.getElementById("ol_location").value = "";
  document.getElementById("ol_category").value = "";
  document.getElementById("ol_description").value = "";
  document.getElementById("ol_eventFormat").value = "in_person";
  removeImage();
  ticketTiersStore = {};
  inviteAttendees = [];
  currentEventSubtype = "public";

  // Reset format buttons
  document.querySelectorAll(".ol-format-btn").forEach((btn, i) => {
    if (i === 0) {
      btn.classList.add("border-white", "text-white", "bg-zinc-800");
      btn.classList.remove("border-transparent", "text-zinc-400");
    } else {
      btn.classList.remove("border-white", "text-white", "bg-zinc-800");
      btn.classList.add("border-transparent", "text-zinc-400");
    }
  });

  // Reset event type cards
  document.querySelectorAll(".evt-type-card").forEach((card, i) => {
    card.classList.toggle("selected", i === 0);
    const dot = card.querySelector(".w-2\\.5");
    const ring = card.querySelector(".w-5");
    if (i === 0) {
      ring?.classList.replace("border-zinc-600", "border-white");
      dot?.classList.remove("scale-0");
    } else {
      ring?.classList.replace("border-white", "border-zinc-600");
      dot?.classList.add("scale-0");
    }
  });

  // Reset ticket tiers
  const container = document.getElementById("ticketTiersContainer");
  if (container) { container.innerHTML = ""; addTicketTier(); }
  const containerPrivate = document.getElementById("ticketTiersContainerPrivate");
  if (containerPrivate) { containerPrivate.innerHTML = ""; }

  // Reset attendee list
  renderInviteAttendeeList();

  // Show overlay at step 1
  goToStep(1);
  document.getElementById("createEventOverlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function editEvent(eventId) {
  const event = getEventById(eventId);
  if (!event) return;

  currentEditingEventId = eventId;

  // Populate overlay fields
  document.getElementById("ol_eventName").value    = event.name || "";
  document.getElementById("ol_location").value     = event.location || "";
  document.getElementById("ol_category").value     = event.category || "";
  document.getElementById("ol_description").value  = event.description || "";

  if (event.date) {
    const [datePart, timePart] = event.date.split("T");
    document.getElementById("ol_eventDate").value = datePart || "";
    document.getElementById("ol_eventTime").value = timePart?.substring(0,5) || "";
  }

  // Format
  document.getElementById("ol_eventFormat").value = event.eventFormat || "in_person";
  document.querySelectorAll(".ol-format-btn").forEach(btn => {
    const isActive = btn.textContent.trim().toLowerCase().replace("-","_") ===
      (event.eventFormat || "in_person").replace("_","").toLowerCase() ||
      (event.eventFormat === "in_person" && btn.textContent.includes("person")) ||
      (event.eventFormat === "online"    && btn.textContent.includes("Online"));
    btn.classList.toggle("border-white",    isActive);
    btn.classList.toggle("text-white",      isActive);
    btn.classList.toggle("bg-zinc-800",     isActive);
    btn.classList.toggle("border-transparent", !isActive);
    btn.classList.toggle("text-zinc-400",   !isActive);
  });

  // Image
  if (event.imageUrl) {
    selectedEventImage = event.imageUrl;
    document.getElementById("ol_emptyState")?.classList.add("hidden");
    document.getElementById("ol_previewState")?.classList.remove("hidden");
    const olCard   = document.getElementById("ol_previewCard");
    const olBanner = document.getElementById("ol_previewBanner");
    if (olCard)   olCard.src   = event.imageUrl;
    if (olBanner) olBanner.src = event.imageUrl;
  } else {
    removeImage();
  }

  // Ticket tiers
  const container = document.getElementById("ticketTiersContainer");
  container.innerHTML = "";
  if (event.tickets?.length) {
    event.tickets.forEach(tier => {
      addTicketTier();
      const tiers = container.querySelectorAll(":scope > div");
      const last  = tiers[tiers.length - 1];
      last.querySelector(".ticket-name").value  = tier.name     || "";
      last.querySelector(".ticket-price").value = tier.price    || "";
      last.querySelector(".ticket-qty").value   = tier.quantity || "";
    });
  } else {
    addTicketTier();
  }

  // Show overlay
  goToStep(1);
  document.getElementById("createEventOverlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function cancelEdit() {
  currentEditingEventId = null;
  document.getElementById("createEventOverlay").classList.add("hidden");
  document.body.style.overflow = "";
  removeImage();
  ticketTiersStore = {};
  inviteAttendees = [];
}

/* =========================
   📤 EVENT SHARING
========================= */

let currentShareEventId = null;
let currentShareLink = null;
let qrCodeInstance = null;

function shareEvent(eventId) {
  const event = getEventById(eventId);
  if (!event) return;

  currentShareEventId = eventId;
  
  
  // Generate share link
  const baseUrl = window.location.origin === "null" || window.location.protocol === "file:"
    ? window.location.href.split('/').slice(0, -1).join('/')  // Get current directory
    : window.location.origin;
    
  currentShareLink = `${baseUrl}/event-detail.html?id=${eventId}`;

  // Update modal content
  document.getElementById("shareEventName").textContent = event.name;
  document.getElementById("shareEventLink").value = currentShareLink;

  // ✅ Copy link immediately WITHOUT button reference
  copyShareLinkAuto(); // Use separate function for auto-copy

  // Show modal
  document.getElementById("shareEventModal").classList.remove("hidden");
  
  // Generate QR code immediately (always ready)
  generateQRCode();
}

function closeShareModal() {
  document.getElementById("shareEventModal").classList.add("hidden");
  document.getElementById("qrCodeSection").classList.add("hidden");
  currentShareEventId = null;
  currentShareLink = null;
  
  // Clear QR code
  if (qrCodeInstance) {
    document.getElementById("shareQRCode").innerHTML = "";
    qrCodeInstance = null;
  }
}

function copyShareLink() {
  const input = document.getElementById("shareEventLink");
  input.select();
  
  navigator.clipboard.writeText(currentShareLink).then(() => {
    // Visual feedback
    const button = event.target;
    const originalText = button.innerHTML;
    button.innerHTML = '<iconify-icon icon="lucide:check" width="12"></iconify-icon>';
    button.classList.add("bg-emerald-500");
    
    setTimeout(() => {
      button.innerHTML = originalText;
      button.classList.remove("bg-emerald-500");
    }, 2000);

    // Toast notification
    showToast("Link copied to clipboard!");
  }).catch(err => {
    alert("Failed to copy link");
  });
}

// 🆕 NEW: Auto-copy function (no button reference needed)
function copyShareLinkAuto() {
  navigator.clipboard.writeText(currentShareLink).then(() => {
    // Toast notification only
    showToast("Link copied to clipboard!");
  }).catch(err => {
    console.error("Auto-copy failed:", err);
    // Silent fail - user can still manually copy
  });
}

function shareViaWhatsApp() {
  const event = getEventById(currentShareEventId);
  const message = `Check out this event: ${event.name}!\n\n${currentShareLink}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
}

function shareViaEmail() {
  const event = getEventById(currentShareEventId);
  const subject = `Invitation: ${event.name}`;
  const body = `You're invited to ${event.name}!\n\nView event details and book your ticket here:\n${currentShareLink}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
}

function showQRCode() {
  const section = document.getElementById("qrCodeSection");
  section.classList.toggle("hidden");
}

function generateQRCode() {
  const container = document.getElementById("shareQRCode");
  container.innerHTML = ""; // Clear previous
  
  qrCodeInstance = new QRCode(container, {
    text: currentShareLink,
    width: 192,
    height: 192,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

// Toast notification helper
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "fixed bottom-6 right-6 bg-zinc-800 border border-white/10 text-white px-4 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2 animate-[slideUp_0.3s_ease-out]";
  toast.innerHTML = `
    <iconify-icon icon="lucide:check-circle" width="16" class="text-emerald-500"></iconify-icon>
    <span class="text-sm">${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function closeEditModal() {
  currentEditingEventId = null;
  // Old modal is removed — nothing to close
}

/* =========================
   🎟️ TICKET TEMPLATE EDITOR
========================= */

// Event Delegation - Open Editor
document.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-tier-action="configure-template"]');
  if (!btn) return;

  e.preventDefault();

  // Find the tier index
  const tierWrapper = btn.closest("#ticketTiersContainer > div");
  const allTiers = Array.from(document.querySelectorAll("#ticketTiersContainer > div"));
  const tierIndex = allTiers.indexOf(tierWrapper);

  if (tierIndex === -1) {
    alert("Please save ticket details first");
    return;
  }

  openTicketTemplateEditor(tierIndex);
});

function openTicketTemplateEditor(tierIndex) {
  currentEditingTierIndex = tierIndex;

  // Create consistent tier ID based on index
  const tierId = `tier-index-${tierIndex}`;
  
  // Load existing template if any
  if (ticketTiersStore[tierId]) {
    currentTicketTemplate = JSON.parse(JSON.stringify(ticketTiersStore[tierId]));
  } else {
    // Reset to default
    currentTicketTemplate = {
      backgroundImage: null,
      labels: []
    };
  }

  // Load template into canvas
  loadTicketTemplateToCanvas();

  document.getElementById("createEventOverlay").classList.add("hidden");
  // Show editor
  document.getElementById("ticketTemplateEditor").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function loadTicketTemplateToCanvas() {
  const canvas = document.getElementById("ticketCanvas");
  const bgImg = document.getElementById("templateBg");
  const bgPreview = document.getElementById("templateBgPreview");

  // Clear canvas
  canvas.innerHTML = '';
  
  // Reset background
  bgImg.src = "";
  bgImg.style.opacity = "0";
  bgPreview.src = "";
  bgPreview.style.opacity = "0";

  // Load background if exists
  if (currentTicketTemplate.backgroundImage) {
    bgImg.src = currentTicketTemplate.backgroundImage;
    bgImg.style.opacity = "0.5";
    bgPreview.src = currentTicketTemplate.backgroundImage;
    bgPreview.style.opacity = "1";
  }

  // Re-add background image element (it gets cleared)
  const bgElement = document.createElement("img");
  bgElement.id = "templateBg";
  bgElement.src = currentTicketTemplate.backgroundImage || "";
  bgElement.className = "absolute inset-0 w-full h-full object-cover select-none pointer-events-none transition-opacity";
  bgElement.style.opacity = currentTicketTemplate.backgroundImage ? "0.5" : "0";
  canvas.appendChild(bgElement);

  // Load labels
  currentTicketTemplate.labels.forEach((label, index) => {
    createDraggableLabel(label, index);
  });

  updateLabelsListSidebar();
}

/* =========================
   🎨 PREVIEW MODE
========================= */

// Sample data for preview
const PREVIEW_DATA = {
  ATTENDEE_NAME: "John Smith",
  TICKET_ID: "TICK-2026-ABCD-1234",
  EVENT_DATE: "Feb 20, 2026 • 7:00 PM",
  QR_CODE: "QR_PLACEHOLDER"
};

// Preview mode state
let isPreviewMode = false;


function createDraggableLabel(labelData, index) {
  const canvas = document.getElementById("ticketCanvas");
  
  const labelEl = document.createElement("div");
  labelEl.id = `label-${index}`;
  labelEl.className = "draggable-item absolute border-2 border-dashed px-3 py-2 rounded-lg flex items-center gap-2 min-w-[150px] group";
  labelEl.style.left = `${labelData.x}px`;
  labelEl.style.top = `${labelData.y}px`;
  labelEl.style.fontSize = `${labelData.fontSize || 32}px`; // NEW!
  labelEl.style.fontFamily = labelData.fontFamily || 'Inter, sans-serif'; // NEW!
  labelEl.style.color = labelData.color || '#000000'; // NEW!
  labelEl.dataset.labelIndex = index;

  // Style based on type
  const colorMap = {
    ATTENDEE_NAME: { border: "#6366f1", text: "indigo" },
    TICKET_ID: { border: "#10b981", text: "emerald" },
    EVENT_DATE: { border: "#f59e0b", text: "amber" },
    QR_CODE: { border: "#8b5cf6", text: "purple" }
  };

  const colors = colorMap[labelData.type] || { border: "#fff", text: "white" };
  labelEl.style.borderColor = colors.border;
  labelEl.style.backgroundColor = "rgba(255,255,255,0.9)";

  if (labelData.type === "QR_CODE") {
    labelEl.classList.remove("min-w-[150px]");
    labelEl.classList.add("w-24", "h-24", "justify-center");
    labelEl.innerHTML = `
      <iconify-icon icon="lucide:qr-code" width="40" class="text-${colors.text}-600 pointer-events-none"></iconify-icon>
    `;
  } else {
    labelEl.innerHTML = `
      <iconify-icon icon="lucide:move" class="text-${colors.text}-500 opacity-50 cursor-grab flex-shrink-0"></iconify-icon>
      <span style="line-height: 1.3;" class="font-semibold pointer-events-none select-none flex-grow">{${labelData.type.replace("_", " ")}}</span>
      <button onclick="removeLabelFromCanvas(${index})" class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <iconify-icon icon="lucide:x" width="14" class="text-red-500"></iconify-icon>
      </button>
    `;
  }

  // Make draggable
  makeLabelDraggable(labelEl, index);

  canvas.appendChild(labelEl);
}

function makeLabelDraggable(element, labelIndex) {
  let isDragging = false;
  let startX, startY, offsetX, offsetY;

  element.addEventListener("mousedown", (e) => {
    // Don't drag if clicking the remove button
    if (e.target.closest('button')) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = element.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;

    element.style.cursor = "grabbing";
    element.style.opacity = "0.8";
    element.style.transform = "scale(1.05)";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    e.preventDefault();

    const canvas = document.getElementById("ticketCanvas");
    const canvasRect = canvas.getBoundingClientRect();
    
    // 🔑 KEY FIX: Account for zoom scale
    const scale = currentZoom || 0.5;

    // Calculate position relative to zoomed canvas
    let newX = (e.clientX - canvasRect.left) / scale - offsetX / scale;
    let newY = (e.clientY - canvasRect.top) / scale - offsetY / scale;

    // 🔑 FIXED BOUNDARIES: Use actual canvas size (2048x662), not visual size
    const canvasWidth = 2048;
    const canvasHeight = 662;

    // Get element's ACTUAL width/height on the canvas (not scaled)
    const elementWidth = element.offsetWidth;
    const elementHeight = element.offsetHeight;

    newX = Math.max(0, Math.min(newX, canvasWidth - elementWidth));
    newY = Math.max(0, Math.min(newY, canvasHeight - elementHeight));

    element.style.left = `${newX}px`;
    element.style.top = `${newY}px`;

    // Update state
    if (currentTicketTemplate.labels[labelIndex]) {
      currentTicketTemplate.labels[labelIndex].x = Math.round(newX);
      currentTicketTemplate.labels[labelIndex].y = Math.round(newY);
    }
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;

    isDragging = false;
    element.style.cursor = "grab";
    element.style.opacity = "1";
    element.style.transform = "scale(1)";
  });
}

function addLabelToCanvas(labelType) {
  // Check if label already exists
  const exists = currentTicketTemplate.labels.some(l => l.type === labelType);
  if (exists) {
    alert(`${labelType.replace("_", " ")} already added`);
    return;
  }

  const newLabel = {
    type: labelType,
    x: 100,
    y: 100 + (currentTicketTemplate.labels.length * 80),
    fontSize: labelType === "QR_CODE" ? 0 : 32, // Changed from 24 to 32
    fontFamily: 'Inter, sans-serif', // NEW!
    color: "#000000"
  };

  currentTicketTemplate.labels.push(newLabel);

  createDraggableLabel(newLabel, currentTicketTemplate.labels.length - 1);
  updateLabelsListSidebar();
}

function removeLabelFromCanvas(labelIndex) {
  // Remove from DOM
  const labelEl = document.getElementById(`label-${labelIndex}`);
  if (labelEl) labelEl.remove();

  // Remove from state
  currentTicketTemplate.labels.splice(labelIndex, 1);

  // Re-render to fix indices
  loadTicketTemplateToCanvas();
}

function updateLabelsListSidebar() {
  const container = document.getElementById("labelsListContainer");

  if (currentTicketTemplate.labels.length === 0) {
    container.innerHTML = '<p class="text-center py-4 text-zinc-500">No labels added yet</p>';
    return;
  }

  container.innerHTML = currentTicketTemplate.labels.map((label, index) => `
    <div class="bg-zinc-800 px-3 py-2.5 rounded-lg space-y-2 border border-white/5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-white">${label.type.replace("_", " ")}</span>
        <div class="flex items-center gap-2">
          <button onclick="editLabel(${index})" class="text-indigo-400 hover:text-indigo-300 transition-colors" title="Edit Style">
            <iconify-icon icon="lucide:palette" width="14"></iconify-icon>
          </button>
          <button onclick="removeLabelFromCanvas(${index})" class="text-red-400 hover:text-red-300 transition-colors" title="Remove">
            <iconify-icon icon="lucide:trash-2" width="12"></iconify-icon>
          </button>
        </div>
      </div>
      ${label.type !== "QR_CODE" ? `
        <div class="text-[10px] text-zinc-500 space-y-0.5 font-mono">
          <div>Size: ${label.fontSize || 32}px</div>
          <div class="truncate">Font: ${(label.fontFamily || 'Inter').split(',')[0]}</div>
        </div>
      ` : `
        <div class="text-[10px] text-zinc-500">QR Code • Auto-sized</div>
      `}
    </div>
  `).join("");
}

function handleTemplateBgUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please upload an image file");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const base64 = e.target.result;

    currentTicketTemplate.backgroundImage = base64;

    // Update canvas background
    const bgImg = document.getElementById("templateBg");
    const bgPreview = document.getElementById("templateBgPreview");

    bgImg.src = base64;
    bgImg.style.opacity = "0.5";

    bgPreview.src = base64;
    bgPreview.style.opacity = "1";
  };

  reader.readAsDataURL(file);
}

function saveTicketTemplate() {
  if (currentEditingTierIndex === null) return;

  // Save to store with consistent tier ID
  const tierId = `tier-index-${currentEditingTierIndex}`;
  ticketTiersStore[tierId] = JSON.parse(JSON.stringify(currentTicketTemplate));

  alert("Ticket template saved!");
  closeTicketTemplateEditor();
}

function closeTicketTemplateEditor() {
  document.getElementById("ticketTemplateEditor").classList.add("hidden");
  document.getElementById("createEventOverlay").classList.remove("hidden");
  document.body.style.overflow = "";
  currentEditingTierIndex = null;
}

function resetTicketCanvas() {
  if (!confirm("Reset all labels and background?")) return;

  currentTicketTemplate = {
    backgroundImage: null,
    labels: []
  };

  loadTicketTemplateToCanvas();
}

/* =========================
   ☁️ CLOUDINARY UPLOAD
========================= */

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "entriqs_events");

  const res = await fetch("https://api.cloudinary.com/v1_1/diizrc4lc/image/upload", {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Cloudinary upload failed");
  return data.secure_url;
}

/* =========================
   🖼️ IMAGE UPLOAD LOGIC
========================= */

async function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please upload an image file");
    return;
  }

  // Show uploading state
  const emptyStates = ["createEmptyState", "emptyState"];
  emptyStates.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `
      <div class="flex flex-col items-center gap-2 text-zinc-500">
        <iconify-icon icon="lucide:loader" class="animate-spin" width="24"></iconify-icon>
        <p class="text-xs">Uploading...</p>
      </div>
    `;
  });

  try {
    const imageUrl = await uploadToCloudinary(file);
    selectedEventImage = imageUrl;

    // Handle overlay preview
    document.getElementById("ol_emptyState")?.classList.add("hidden");
    document.getElementById("ol_previewState")?.classList.remove("hidden");
    const olCard   = document.getElementById("ol_previewCard");
    const olBanner = document.getElementById("ol_previewBanner");
    if (olCard)   olCard.src   = selectedEventImage;
    if (olBanner) olBanner.src = selectedEventImage;

    // Handle Edit Form preview
    document.getElementById("emptyState")?.classList.add("hidden");
    document.getElementById("previewState")?.classList.remove("hidden");
    const card = document.getElementById("previewCard");
    const banner = document.getElementById("previewBanner");
    if (card) card.src = selectedEventImage;
    if (banner) banner.src = selectedEventImage;

  } catch (err) {
    console.error("Image upload failed", err);
    alert("Failed to upload image. Please try again.");
    removeImage();
  }
}

function removeImage() {
  selectedEventImage = null;

  // Reset overlay
  const olInput = document.getElementById("ol_fileInput");
  if (olInput) olInput.value = "";
  document.getElementById("ol_emptyState")?.classList.remove("hidden");
  document.getElementById("ol_previewState")?.classList.add("hidden");

  // Reset Edit Form
  const editInput = document.getElementById("fileInput");
  if (editInput) editInput.value = "";
  document.getElementById("emptyState")?.classList.remove("hidden");
  document.getElementById("previewState")?.classList.add("hidden");
}

/* Drag & Drop support */
(function initDropZone() {
  // Initialize Create Form drop zone
  const createDropZone = document.getElementById("ol_dropZone");
  if (createDropZone) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach(evt =>
      createDropZone.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
      })
    );

    createDropZone.addEventListener("drop", e => {
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      // Trigger the file input change event
      const createFileInput = document.getElementById("ol_fileInput");
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      createFileInput.files = dataTransfer.files;

      handleImageUpload({ target: { files: [file] } });
    });
  }

  // Initialize Edit Form drop zone
  const editDropZone = document.getElementById("dropZone");
  if (editDropZone) {
    ["dragenter", "dragover", "dragleave", "drop"].forEach(evt =>
      editDropZone.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
      })
    );

    editDropZone.addEventListener("drop", e => {
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      handleImageUpload({ target: { files: [file] } });
    });
  }
})();


function hydrateOrganizerCard() {
  if (!userSession?.user) return;

  const nameEl = document.getElementById("organizerName");
  const initialsEl = document.getElementById("organizerInitials");

  const user = userSession.user;

  if (nameEl) {
    nameEl.textContent =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Organizer";
  }

  if (initialsEl) {
    initialsEl.textContent = user.initials || "--";
  }

  // Real counts
  const events = getAllEvents();
  const allEvents = Object.values(events);

  const activeCount = allEvents.filter(e => e.status !== "draft").length;
  const totalTicketsSold = allEvents.reduce((sum, e) => sum + (e.ticketsSold || 0), 0);

  document.getElementById("activeEventsCount").textContent = activeCount;
  document.getElementById("totalTicketsSoldCount").textContent = totalTicketsSold >= 1000
    ? (totalTicketsSold / 1000).toFixed(1) + "k"
    : totalTicketsSold;
}

hydrateOrganizerCard();

// Save as draft function
async function saveDraft(payload) {
  try {
    const res = await fetch(`${API_URL}/api/organizer/events`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        name:        payload.name || "Untitled Draft",
        date:        payload.date,
        location:    payload.location,
        category:    payload.category,
        description: payload.description,
        eventType:   payload.eventType,
        eventFormat: payload.eventFormat,
        imageUrl:    payload.imageUrl,
        tickets:     payload.tickets,
        status:      "draft"
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save draft");

    const event = normalizeEventFromAPI(data.event);
    eventsData[event.id] = event;
    saveEventsToStorage();
    return event.id;
  } catch (err) {
    console.error("Save draft error", err);
    alert("Failed to save draft: " + err.message);
    return null;
  }
}
/* =========================
   🎨 FONT CUSTOMIZATION
========================= */

// Edit Label Function
function editLabel(labelIndex) {
  const label = currentTicketTemplate.labels[labelIndex];
  if (!label || label.type === "QR_CODE") {
    alert("QR codes cannot be customized");
    return;
  }

  // Show edit panel
  document.getElementById("labelEditPanel").classList.remove("hidden");
  document.getElementById("labelEditorTitle").textContent = `Edit ${label.type.replace("_", " ")}`;
  
  // Populate current values
  document.getElementById("labelFontSize").value = label.fontSize || 32;
  document.getElementById("fontSizeDisplay").textContent = `${label.fontSize || 32}px`;
  document.getElementById("labelFontFamily").value = label.fontFamily || 'Inter, sans-serif';
  document.getElementById("labelColor").value = label.color || '#000000';
  document.getElementById("labelColorHex").value = label.color || '#000000';
  
  // Store current editing index
  window.currentEditingLabelIndex = labelIndex;
}

// Close Edit Panel
function closeLabelEditPanel() {
  document.getElementById("labelEditPanel").classList.add("hidden");
  window.currentEditingLabelIndex = undefined;
}

// Apply Label Changes
function applyLabelChanges() {
  const index = window.currentEditingLabelIndex;
  if (index === undefined) return;

  const fontSize = parseInt(document.getElementById("labelFontSize").value);
  const fontFamily = document.getElementById("labelFontFamily").value;
  const color = document.getElementById("labelColor").value;

  // Update state
  currentTicketTemplate.labels[index].fontSize = fontSize;
  currentTicketTemplate.labels[index].fontFamily = fontFamily;
  currentTicketTemplate.labels[index].color = color;

  // Update DOM element
  updateLabelStyle(index);
  
  // Update sidebar
  updateLabelsListSidebar();
  
  // Close panel
  closeLabelEditPanel();
  
  // Success feedback
  const btn = event.target;
  btn.innerHTML = '<iconify-icon icon="lucide:check-check" width="14"></iconify-icon> Saved!';
  setTimeout(() => {
    closeLabelEditPanel();
  }, 600);
}

// Update Label Style in Canvas
function updateLabelStyle(index) {
  const label = currentTicketTemplate.labels[index];
  const labelEl = document.getElementById(`label-${index}`);
  
  if (!labelEl || !label) return;

  labelEl.style.fontSize = `${label.fontSize}px`;
  labelEl.style.fontFamily = label.fontFamily;
  labelEl.style.color = label.color;
}

// Live Font Size Update
function updateFontSizeDisplay() {
  const value = document.getElementById("labelFontSize").value;
  document.getElementById("fontSizeDisplay").textContent = `${value}px`;
  
  // Live preview
  if (window.currentEditingLabelIndex !== undefined) {
    const index = window.currentEditingLabelIndex;
    currentTicketTemplate.labels[index].fontSize = parseInt(value);
    updateLabelStyle(index);
  }
}

// Live Font Family Update
function updateFontFamilyLive() {
  if (window.currentEditingLabelIndex !== undefined) {
    const index = window.currentEditingLabelIndex;
    const fontFamily = document.getElementById("labelFontFamily").value;
    currentTicketTemplate.labels[index].fontFamily = fontFamily;
    updateLabelStyle(index);
  }
}

// Live Color Update
function updateColorLive() {
  if (window.currentEditingLabelIndex !== undefined) {
    const index = window.currentEditingLabelIndex;
    const color = document.getElementById("labelColor").value;
    currentTicketTemplate.labels[index].color = color;
    document.getElementById("labelColorHex").value = color;
    updateLabelStyle(index);
  }
}

/* =========================
   🎨 PREVIEW MODE TOGGLE
========================= */

function togglePreviewMode() {
  isPreviewMode = !isPreviewMode;
  
  const canvas = document.getElementById("ticketCanvas");
  const previewBtn = document.getElementById("previewModeBtn");
  
  if (isPreviewMode) {
    // Switch to preview mode
    renderPreviewMode();
    previewBtn.innerHTML = `
      <iconify-icon icon="lucide:edit-3" width="16"></iconify-icon>
      Edit Mode
    `;
    previewBtn.classList.remove("bg-indigo-500/10", "border-indigo-500/30", "text-indigo-400");
    previewBtn.classList.add("bg-emerald-500/10", "border-emerald-500/30", "text-emerald-400");
  } else {
    // Switch back to edit mode
    loadTicketTemplateToCanvas();
    previewBtn.innerHTML = `
      <iconify-icon icon="lucide:eye" width="16"></iconify-icon>
      Preview Mode
    `;
    previewBtn.classList.remove("bg-emerald-500/10", "border-emerald-500/30", "text-emerald-400");
    previewBtn.classList.add("bg-indigo-500/10", "border-indigo-500/30", "text-indigo-400");
  }
}

function renderPreviewMode() {
  const canvas = document.getElementById("ticketCanvas");
  canvas.innerHTML = '';

  // Add background if exists
  const bgElement = document.createElement("img");
  bgElement.id = "templateBg";
  bgElement.src = currentTicketTemplate.backgroundImage || "";
  bgElement.className = "absolute inset-0 w-full h-full object-cover select-none pointer-events-none";
  bgElement.style.opacity = currentTicketTemplate.backgroundImage ? "1" : "0"; // Full opacity in preview
  canvas.appendChild(bgElement);

  // Render labels with real preview data
  currentTicketTemplate.labels.forEach((label, index) => {
    const labelEl = document.createElement("div");
    labelEl.className = "absolute";
    labelEl.style.left = `${label.x}px`;
    labelEl.style.top = `${label.y}px`;
    labelEl.style.fontSize = `${label.fontSize || 32}px`;
    labelEl.style.fontFamily = label.fontFamily || 'Inter, sans-serif';
    labelEl.style.color = label.color || '#000000';
    labelEl.style.fontWeight = "600";
    labelEl.style.lineHeight = "1.3";

    if (label.type === 'QR_CODE') {
      // Generate realistic QR code preview
      labelEl.innerHTML = `
        <div style="width: 96px; height: 96px; background: white; padding: 8px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
            <rect width="100" height="100" fill="white"/>
            <g fill="black">
              ${generateQRPattern()}
            </g>
          </svg>
        </div>
      `;
    } else {
      // Render text with sample data
      labelEl.textContent = PREVIEW_DATA[label.type] || '';
      labelEl.style.backgroundColor = "rgba(255,255,255,0.95)";
      labelEl.style.padding = "8px 16px";
      labelEl.style.borderRadius = "8px";
      labelEl.style.backdropFilter = "blur(4px)";
      labelEl.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      labelEl.style.whiteSpace = "nowrap";
    }

    canvas.appendChild(labelEl);
  });
}

// Generate simple QR pattern for preview
function generateQRPattern() {
  let pattern = '';
  const size = 10; // Size of each square
  
  // Create a realistic-looking QR pattern
  for (let i = 0; i < 100; i += size) {
    for (let j = 0; j < 100; j += size) {
      // Create patterns: corners, random data
      const isCorner = (i < 30 && j < 30) || (i < 30 && j > 70) || (i > 70 && j < 30);
      const shouldFill = isCorner || Math.random() > 0.5;
      
      if (shouldFill) {
        pattern += `<rect x="${j}" y="${i}" width="${size}" height="${size}"/>`;
      }
    }
  }
  
  return pattern;
}


/* =========================
   🔍 CANVAS ZOOM CONTROLS
========================= */

let currentZoom = 0.5; // Track current zoom level

function zoomCanvas(scale) {
  currentZoom = scale;
  const wrapper = document.getElementById("canvasWrapper");
  if (!wrapper) return;
  
  // Update transform
  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.transformOrigin = "top left";
  
  // Update container size to match zoomed canvas
  const container = wrapper.parentElement;
  if (container) {
    container.style.width = `${2048 * scale}px`;
    container.style.height = `${662 * scale}px`;
  }
}

/* =========================
   🪜 STEP NAVIGATION
========================= */

let currentStep = 1;
let currentEventSubtype = "public"; // public | private_ticketed | invite_only
let inviteAttendees = []; // for invite_only events

function goToStep(step) {
  currentStep = step;

  // Hide all steps
  [1, 2, 3].forEach(n => {
    document.getElementById(`overlayStep${n}`)?.classList.add("hidden");
  });

  // Show current step
  document.getElementById(`overlayStep${step}`)?.classList.remove("hidden");

  // Update step indicators
  [1, 2, 3].forEach(n => {
    const indicator = document.getElementById(`stepIndicator${n}`);
    const label     = document.getElementById(`stepLabel${n}`);
    if (!indicator || !label) return;

    indicator.classList.remove("active", "done");
    label.classList.remove("active", "done");

    if (n === step) {
      indicator.classList.add("active");
      label.classList.add("active");
    } else if (n < step) {
      indicator.classList.add("done");
      label.classList.add("done");
      indicator.innerHTML = `<iconify-icon icon="lucide:check" width="12"></iconify-icon>`;
    } else {
      indicator.textContent = n;
    }
  });

  // Scroll to top of overlay
  document.getElementById("createEventOverlay").scrollTo({ top: 0, behavior: "smooth" });

  // Populate review panel when reaching step 3
  if (step === 3) updateReviewPanel();
}

function selectOlFormat(format, btn) {
  document.getElementById("ol_eventFormat").value = format;
  document.querySelectorAll(".ol-format-btn").forEach(b => {
    b.classList.remove("border-white", "text-white", "bg-zinc-800");
    b.classList.add("border-transparent", "text-zinc-400");
  });
  btn.classList.add("border-white", "text-white", "bg-zinc-800");
  btn.classList.remove("border-transparent", "text-zinc-400");
}

function selectEventSubtype(subtype, card) {
  currentEventSubtype = subtype;
  document.querySelectorAll(".evt-type-card").forEach(c => {
    c.classList.remove("selected");
    const dot  = c.querySelector(".w-2\\.5");
    const ring = c.querySelector(".w-5");
    ring?.classList.replace("border-white", "border-zinc-600");
    dot?.classList.add("scale-0");
  });
  card.classList.add("selected");
  const dot  = card.querySelector(".w-2\\.5");
  const ring = card.querySelector(".w-5");
  ring?.classList.replace("border-zinc-600", "border-white");
  dot?.classList.remove("scale-0");
}

/* =========================
   📋 REVIEW PANEL
========================= */

function updateReviewPanel() {
  const name     = document.getElementById("ol_eventName")?.value || "—";
  const date     = document.getElementById("ol_eventDate")?.value || "—";
  const time     = document.getElementById("ol_eventTime")?.value || "—";
  const location = document.getElementById("ol_location")?.value  || "—";
  const category = document.getElementById("ol_category")?.value  || "—";
  const format   = document.getElementById("ol_eventFormat")?.value || "in_person";

  document.getElementById("review_name").textContent     = name;
  document.getElementById("review_date").textContent     = date;
  document.getElementById("review_time").textContent     = time;
  document.getElementById("review_location").textContent = location;
  document.getElementById("review_category").textContent = category;

  // Type badge
  const typeLabels = { public: "Public", private_ticketed: "Private Ticketed", invite_only: "Invite Only" };
  document.getElementById("review_typeBadge").textContent   = typeLabels[currentEventSubtype] || "Public";
  document.getElementById("review_formatBadge").textContent = format === "online" ? "Online" : "In-Person";

  // Image
  const imgEl = document.getElementById("review_image");
  if (selectedEventImage) {
    imgEl.innerHTML = `<img src="${selectedEventImage}" class="w-full h-full object-cover">`;
  }

  // Tickets vs attendees
  const ticketsSection  = document.getElementById("review_ticketsSection");
  const attendeesSection = document.getElementById("review_attendeesSection");

  if (currentEventSubtype === "invite_only") {
    ticketsSection.classList.add("hidden");
    attendeesSection.classList.remove("hidden");
    document.getElementById("review_attendeesCount").textContent =
      `${inviteAttendees.length} attendee${inviteAttendees.length !== 1 ? "s" : ""} added`;
  } else {
    ticketsSection.classList.remove("hidden");
    attendeesSection.classList.add("hidden");
    const container = currentEventSubtype === "private_ticketed"
      ? document.getElementById("ticketTiersContainerPrivate")
      : document.getElementById("ticketTiersContainer");
    const tiers = collectTicketTiersFrom(container);
    const list  = document.getElementById("review_ticketsList");
    list.innerHTML = tiers.length
      ? tiers.map(t => `
          <div class="flex items-center justify-between p-3 rounded-xl border border-white/8 bg-zinc-900/30">
            <span class="text-sm font-medium text-white">${t.name}</span>
            <div class="flex items-center gap-4 text-sm text-zinc-400">
              <span>${t.price > 0 ? `₦${t.price.toLocaleString()}` : "Free"}</span>
              <span class="flex items-center gap-1"><iconify-icon icon="lucide:users" width="12"></iconify-icon> ${t.quantity}</span>
            </div>
          </div>`).join("")
      : `<p class="text-sm text-zinc-500">No ticket tiers added</p>`;
  }
}

/* =========================
   🎫 TICKET TIERS (Private)
========================= */

function addTicketTierPrivate() {
  const container = document.getElementById("ticketTiersContainerPrivate");
  if (!container) return;

  const tierWrapper = document.createElement("div");
  tierWrapper.className = "space-y-2";
  tierWrapper.innerHTML = `
    <div class="grid grid-cols-12 gap-3 items-start">
      <div class="col-span-5 md:col-span-6">
        <input type="text" class="ticket-name w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Tier Name">
      </div>
      <div class="col-span-3 md:col-span-3">
        <div class="relative">
          <span class="absolute left-3 top-2 text-zinc-500 text-xs">#</span>
          <input type="number" class="ticket-price w-full bg-zinc-950 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white tabular-nums" placeholder="0.00">
        </div>
      </div>
      <div class="col-span-3 md:col-span-2">
        <div class="relative">
          <iconify-icon icon="lucide:users" class="absolute left-3 top-2.5 text-zinc-600" width="12"></iconify-icon>
          <input type="number" class="ticket-qty w-full bg-zinc-950 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white tabular-nums" placeholder="Qty">
        </div>
      </div>
      <div class="col-span-1 flex items-center justify-center pt-2">
        <button type="button" onclick="this.closest('.space-y-2').remove()" class="text-zinc-600 hover:text-red-400 transition-colors">
          <iconify-icon icon="lucide:trash-2" width="16"></iconify-icon>
        </button>
      </div>
    </div>`;
  container.appendChild(tierWrapper);
}

function collectTicketTiersFrom(container) {
  if (!container) return [];
  const tiers = [];
  container.querySelectorAll(":scope > div").forEach((wrapper, index) => {
    const name  = wrapper.querySelector(".ticket-name")?.value.trim();
    const price = Number(wrapper.querySelector(".ticket-price")?.value);
    const qty   = Number(wrapper.querySelector(".ticket-qty")?.value);
    if (!name) return;
    const tierId = `tier-index-${index}`;
    tiers.push({
      id: `tier-${Date.now()}-${index}`,
      name, price: isNaN(price) ? 0 : price,
      quantity: isNaN(qty) ? 0 : qty,
      sold: 0,
      ticketTemplate: ticketTiersStore[tierId] || null
    });
  });
  return tiers;
}

/* =========================
   👥 INVITE ATTENDEES
========================= */

function addInviteAttendee() {
  const fullName = document.getElementById("inv_fullName")?.value.trim();
  const email    = document.getElementById("inv_email")?.value.trim();
  const role     = document.getElementById("inv_role")?.value;
  const seat     = document.getElementById("inv_seat")?.value.trim();
  const plusOne  = document.getElementById("inv_plusOne")?.checked;
  const note     = document.getElementById("inv_note")?.value.trim();

  if (!fullName || !email) {
    alert("Full name and email are required");
    return;
  }

  if (inviteAttendees.some(a => a.email === email)) {
    alert("This email is already on the list");
    return;
  }

  inviteAttendees.push({ fullName, email, role, seat, plusOne, note });

  // Clear inputs
  ["inv_fullName","inv_email","inv_seat","inv_note"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("inv_role").value = "";
  document.getElementById("inv_plusOne").checked = false;

  renderInviteAttendeeList();
}

function removeInviteAttendee(index) {
  inviteAttendees.splice(index, 1);
  renderInviteAttendeeList();
}

function renderInviteAttendeeList() {
  const container = document.getElementById("inviteAttendeeList");
  if (!container) return;

  if (!inviteAttendees.length) {
    container.innerHTML = "";
    return;
  }

  const roleBadgeColors = {
    VIP:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Speaker: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    Staff:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Guest:   "bg-zinc-800 text-zinc-300 border-white/10",
    Custom:  "bg-purple-500/15 text-purple-400 border-purple-500/30"
  };

  container.innerHTML = `
    <div class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 px-1">
      Added Attendees (${inviteAttendees.length})
    </div>
    <div class="border border-white/8 rounded-xl bg-zinc-900/30 divide-y divide-white/5 overflow-hidden">
      ${inviteAttendees.map((a, i) => `
        <div class="flex items-center justify-between p-4 group">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 text-zinc-400 flex items-center justify-center text-xs font-bold shrink-0">
              ${a.fullName.split(" ").map(n => n[0]).join("").substring(0,2).toUpperCase()}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-white">${a.fullName}</span>
                ${a.role ? `<span class="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border font-medium ${roleBadgeColors[a.role] || roleBadgeColors["Guest"]}">${a.role}</span>` : ""}
              </div>
              <p class="text-xs text-zinc-500 mt-0.5">
                ${a.seat ? a.seat + " • " : ""}${a.plusOne ? "+1 Guest" : "No +1"}
              </p>
            </div>
          </div>
          <button onclick="removeInviteAttendee(${i})" class="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
            <iconify-icon icon="lucide:trash-2" width="15"></iconify-icon>
          </button>
        </div>`).join("")}
    </div>`;
}

/* =========================
   📤 OVERLAY PUBLISH / DRAFT
========================= */

function collectOverlayFormData(status = "published") {
  const date = document.getElementById("ol_eventDate")?.value;
  const time = document.getElementById("ol_eventTime")?.value;

  // Get the right ticket container
  const container = currentEventSubtype === "private_ticketed"
    ? document.getElementById("ticketTiersContainerPrivate")
    : document.getElementById("ticketTiersContainer");

  const tickets = currentEventSubtype === "invite_only" ? [] : collectTicketTiersFrom(container);

  // Map subtype to eventType
  const eventType = currentEventSubtype === "public" ? "public" : "private";

  return {
    name:        document.getElementById("ol_eventName")?.value.trim(),
    date:        date && time ? `${date}T${time}` : date || "",
    location:    document.getElementById("ol_location")?.value.trim(),
    category:    document.getElementById("ol_category")?.value.trim(),
    description: document.getElementById("ol_description")?.value.trim(),
    eventType,
    eventSubtype: currentEventSubtype,
    eventFormat: document.getElementById("ol_eventFormat")?.value,
    imageUrl:    selectedEventImage,
    tickets,
    status
  };
}

async function handleOverlayPublish() {
  const payload = collectOverlayFormData("published");
  if (!payload.name) { alert("Event name is required"); return; }

  if (currentEditingEventId) {
    await updateEvent(currentEditingEventId, payload);
    alert("Event updated!");
  } else {
    const eventId = await createEvent(payload);

    if (eventId && payload.eventSubtype === "invite_only" && inviteAttendees.length > 0) {
      await fetch(`${API_URL}/api/organizer/invites`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          eventId,
          attendees: inviteAttendees
        })
      });
    }

    alert("Event published!");
  }

  cancelEdit();
  renderEvents();
  hydrateOrganizerCard();
}

async function handleOverlaySaveDraft() {
  const payload = collectOverlayFormData("draft");
  if (!payload.name) { alert("Please enter at least an event name"); return; }
  await saveDraft(payload);
  alert("Draft saved!");
  cancelEdit();
  renderEvents();
  hydrateOrganizerCard();
}

// ✅ Auto-open Create Event form when arriving from homepage
document.addEventListener("DOMContentLoaded", () => {
  hydrateOrganizerCard();

  if (window.location.hash === "#create-event") {
    openCreateEventForm();
  }

  // Wait for session to be ready before loading events
  const token = localStorage.getItem("entriqs_token");
  if (token) {
    loadEventsFromStorage();
  } else {
    renderEvents();
  }
});
