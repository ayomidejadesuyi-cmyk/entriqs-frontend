/**
 * PROFILE PAGE LOGIC (Frontend-only, Backend-ready)
 * ------------------------------------------------
 * - Shared for organizer & attendee
 * - Uses auth.js identity helpers
 * - Single source of truth: userSession.user
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();

  if (!user) {
    console.warn("Profile page loaded without a user session");
    return;
  }

  normalizeUserIdentity();

  /* -------------------------------------
   * STATE
   * ----------------------------------- */
  let pendingAvatar = null;
  let isEditing = false;

  /* -------------------------------------
   * ELEMENTS
   * ----------------------------------- */
  // Avatar
  const avatarWrapper = document.getElementById("avatarWrapper");
  const avatarCircle = document.getElementById("avatarCircle");
  const avatarFallback = document.getElementById("avatarFallback");
  const avatarInput = document.getElementById("avatarInput");

  // Identity display
  const displayName = document.getElementById("displayName");
  const displayEmail = document.getElementById("displayEmail");
  const roleBadge = document.getElementById("roleBadge");

  // Form
  const form = document.getElementById("profileForm");
  const firstNameInput = document.getElementById("firstNameInput");
  const lastNameInput = document.getElementById("lastNameInput");
  const emailInput = document.getElementById("emailInput");
  const orgNameInput = document.getElementById("orgNameInput");
  const bioInput = document.getElementById("bioInput");
  const phoneInput = document.getElementById("phoneInput");
  const dobInput = document.getElementById("dobInput");
  const cityInput = document.getElementById("cityInput");

  // Actions
  const discardBtn = document.getElementById("discardBtn");
  const deleteAccountBtn = document.getElementById("deleteAccountBtn");
  const editBtn = document.getElementById("editBtn");
  const saveBtn = document.getElementById("saveBtn");

  //Central ui state controller
  function setEditMode(editing) {
  isEditing = editing;

  // Toggle inputs (avatar stays enabled)
  const editableInputs = [firstNameInput, lastNameInput, bioInput];
  if (user.role === "organizer") editableInputs.push(orgNameInput);
  if (user.role === "attendee")  editableInputs.push(phoneInput, dobInput, cityInput);

  editableInputs.forEach(input => {
    if (!input) return;
    input.disabled = !editing;
    input.classList.toggle("opacity-70", !editing);
  });

  // Interest tags
  document.querySelectorAll(".interest-tag").forEach(btn => {
    btn.disabled = !editing;
    btn.classList.toggle("opacity-70", !editing);
  });

  // Buttons
  editBtn.classList.toggle("hidden", editing);
  discardBtn.classList.toggle("hidden", !editing);
  saveBtn.classList.toggle("hidden", !editing);
}

// Show role-specific sections
  if (user.role === "organizer") {
    document.getElementById("organizerSection").classList.remove("hidden");
  } else {
    document.getElementById("attendeeSection").classList.remove("hidden");
  }

  /* -------------------------------------
   * RENDER FUNCTIONS
   * ----------------------------------- */
  function renderAvatar() {
    const tempUser = {
      ...user,
      avatar: pendingAvatar || user.avatar
    };

    renderUserAvatar(avatarCircle, tempUser);

    // Toggle clear button visibility
    if (tempUser.avatar) {
      clearAvatarBtn.classList.remove("hidden");
    } else {
      clearAvatarBtn.classList.add("hidden");
    }
  }


  function renderIdentity() {
    displayName.textContent =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() || "—";

    displayEmail.textContent = user.email || "—";

    roleBadge.innerHTML = `
      <iconify-icon icon="solar:verified-check-linear" width="12"></iconify-icon>
      ${user.role || "user"}
    `;
  }

  function renderForm() {
    firstNameInput.value = user.firstName || "";
    lastNameInput.value = user.lastName || "";
    emailInput.value = user.email || "";
    bioInput.value = user.bio || "";

    if (user.role === "organizer") {
      orgNameInput.value = user.organizationName || "";
    } else {
      if (phoneInput) phoneInput.value = user.phone || "";
      if (dobInput)   dobInput.value   = user.dob   || "";
      if (cityInput)  cityInput.value  = user.city  || "";
      // Render saved interests
      const saved = user.interests || [];
      document.querySelectorAll(".interest-tag").forEach(btn => {
        const isSelected = saved.includes(btn.dataset.interest);
        btn.classList.toggle("selected", isSelected);
      });
    }
  }

  function renderAll() {
    renderAvatar();
    renderIdentity();
    renderForm();
  }

  /* -------------------------------------
   * AVATAR UPLOAD (PREVIEW → SAVE)
   * ----------------------------------- */

  avatarWrapper.addEventListener("click", () => {
    avatarInput.click();
  });

  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;

    // Type check
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file");
      avatarInput.value = "";
      return;
    }

    // Size guard (2MB)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("Profile image must be under 2MB");
      avatarInput.value = "";
      return;
    }

    resizeAvatarImage(file, 256).then((base64) => {
      // ✅ SAVE IMMEDIATELY
      user.avatar = base64;
      pendingAvatar = null;

      saveSession();

      renderAll();
      updateAuthUI();
      hydrateSharedIdentityUI();
    });
  });

function resizeAvatarImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");

        // Crop to square (center)
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;

        ctx.drawImage(
          img,
          sx, sy, min, min,
          0, 0, size, size
        );

        const base64 = canvas.toDataURL("image/jpeg", 0.8);
        resolve(base64);
      };

      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* -------------------------------------
 * CLEAR AVATAR
 * ----------------------------------- */

  clearAvatarBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent avatar upload click

    const confirmed = confirm("Remove profile photo?");
    if (!confirmed) return;

    pendingAvatar = null;
    user.avatar = null;

    saveSession();

    renderAll();
    updateAuthUI();
    hydrateSharedIdentityUI();
  });


/* -------------------------------------
 * FORM SUBMIT
 * ----------------------------------- */

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    const payload = {
      firstName: firstNameInput.value.trim(),
      lastName:  lastNameInput.value.trim(),
      bio:       bioInput.value.trim(),
    };

    if (user.role === "organizer") {
      payload.organizationName = orgNameInput.value.trim();
    } else {
      payload.phone     = phoneInput?.value.trim() || "";
      payload.dob       = dobInput?.value || "";
      payload.city      = cityInput?.value.trim() || "";
      payload.interests = Array.from(
        document.querySelectorAll(".interest-tag.selected")
      ).map(btn => btn.dataset.interest);
    }

    try {
      const token = localStorage.getItem("entriqs_token");
      const res = await fetch("https://entriqs-backend.onrender.com/api/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      // Map snake_case from backend to camelCase for frontend
      const updated = {
        firstName:        data.user.first_name,
        lastName:         data.user.last_name,
        bio:              data.user.bio,
        phone:            data.user.phone,
        dob:              data.user.dob,
        city:             data.user.city,
        interests:        data.user.interests,
        organizationName: data.user.organization_name,
        avatarUrl:        data.user.avatar_url,
        uniqueId:         data.user.unique_id,
      };

      // Update local session with fresh mapped data
      const session = JSON.parse(localStorage.getItem("userSession") || "{}");
      session.user = { ...session.user, ...updated };
      localStorage.setItem("userSession", JSON.stringify(session));

      Object.assign(user, updated);

      normalizeUserIdentity();
      renderAll();
      updateAuthUI?.();
      hydrateSharedIdentityUI?.();
      setEditMode(false);

    } catch (err) {
      alert("Failed to save: " + err.message);
    } finally {
      saveBtn.textContent = "Save Changes";
      saveBtn.disabled = false;
    }
  });

/* -------------------------------------
 * Edit Button
 * ----------------------------------- */
  editBtn.addEventListener("click", () => {
    setEditMode(true);
  });


  /* -------------------------------------
   * DISCARD CHANGES
   * ----------------------------------- */

  discardBtn.addEventListener("click", () => {
    pendingAvatar = null;
    renderAll();
    setEditMode(false);
  });

  /* -------------------------------------
   * DELETE ACCOUNT (Frontend mock)
   * ----------------------------------- */

  deleteAccountBtn.addEventListener("click", () => {
    const confirmed = confirm(
      "This will permanently delete your account. This action cannot be undone."
    );

    if (!confirmed) return;

    localStorage.removeItem("userSession");
    window.location.href = "index.html";
  });

  /* -------------------------------------
   * INIT
   * ----------------------------------- */

  normalizeUserIdentity();
  renderAll();
  setEditMode(false);
});

const backBtn = document.getElementById("backBtn");

if (backBtn) {
  backBtn.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // Fallback if user landed directly on settings
      window.location.href = "index.html";
    }
  });
}

/* -------------------------------------
 * UPDATE ORGANIZER NAME ON ALL EVENTS
 * ----------------------------------- */

function updateOrganizerEventsName(organizerId, newOrgName) {
  try {
    const raw = localStorage.getItem("entriqs_events");
    if (!raw) return;

    let events = JSON.parse(raw);
    
    // ✅ Handle object format (your actual storage structure)
    if (!Array.isArray(events) && typeof events === "object") {
      let updated = false;
      
      // Loop through event object keys
      Object.keys(events).forEach(eventId => {
        const event = events[eventId];
        if (event.organizerId === organizerId) {
          event.organizerOrganization = newOrgName;
          updated = true;
          console.log(`✅ Updated event ${eventId} to org: ${newOrgName}`);
        }
      });

      if (updated) {
        localStorage.setItem("entriqs_events", JSON.stringify(events));
        console.log(`✅ Saved updated events to localStorage`);
      }
    }
  } catch (err) {
    console.error("Failed to update events with new organization name:", err);
  }
}

function toggleInterest(btn) {
  btn.classList.toggle("selected");
}