(function (PrimeScoreApp) {
  // Fallback display names for legacy league codes stored in the database
  const LEGACY_LEAGUE_NAMES = {
    PL: "Premier League",
    CL: "UEFA Champions League",
    BL1: "Bundesliga",
    SA: "Serie A",
    PD: "La Liga",
    FL1: "Ligue 1",
    ELC: "Championship",
    EL: "UEFA Europa League",
    WC: "FIFA World Cup",
    EC: "UEFA European Championship",
  };

  // Edit state: arrays of {id, name, crest?}
  const editState = {
    teams: [],
    players: [],
    leagues: [],
  };

  const LIMITS = { teams: 5, players: 10, leagues: 3 };

  function cap(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // --- Tag rendering ---
  function renderTags(type) {
    const container = PrimeScoreApp.getById(`fav${cap(type)}Tags`);
    if (!container) return;

    if (!editState[type].length) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = editState[type]
      .map(
        (item) =>
          `<span class="fav-tag">
            ${item.crest ? `<img src="${PrimeScoreApp.escapeHtml(item.crest)}" class="fav-tag-crest" alt="">` : ""}
            <span class="fav-tag-name">${PrimeScoreApp.escapeHtml(item.name)}</span>
            <button class="fav-tag-remove" data-type="${PrimeScoreApp.escapeHtml(type)}" data-id="${PrimeScoreApp.escapeHtml(String(item.id))}" aria-label="Remove">×</button>
          </span>`
      )
      .join("");

    container.querySelectorAll(".fav-tag-remove").forEach((btn) => {
      btn.addEventListener("click", () => removeFavItem(btn.dataset.type, btn.dataset.id));
    });
  }

  // --- Add / Remove ---
  function addFavItem(type, item) {
    if (editState[type].some((i) => String(i.id) === String(item.id))) return;
    if (editState[type].length >= LIMITS[type]) {
      PrimeScoreApp.showMessage("favMsg", `Maximum ${LIMITS[type]} ${type} allowed.`);
      return;
    }
    editState[type].push(item);
    renderTags(type);
  }

  function removeFavItem(type, id) {
    editState[type] = editState[type].filter((i) => String(i.id) !== String(id));
    renderTags(type);
  }

  // --- Dropdown helpers ---
  function showSuggestions(suggestionsId, inputId, items, onSelect) {
    const container = PrimeScoreApp.getById(suggestionsId);
    if (!container) return;

    if (!items.length) {
      container.style.display = "none";
      return;
    }

    container.innerHTML = items
      .map(
        (item) =>
          `<div class="suggestion-item" data-id="${PrimeScoreApp.escapeHtml(String(item.id))}">
            ${item.crest ? `<img src="${PrimeScoreApp.escapeHtml(item.crest)}" class="suggestion-crest" alt="">` : ""}
            <span class="suggestion-name">${PrimeScoreApp.escapeHtml(item.name)}</span>
            ${item.subtitle ? `<span class="suggestion-sub">${PrimeScoreApp.escapeHtml(item.subtitle)}</span>` : ""}
          </div>`
      )
      .join("");

    container.style.display = "block";

    container.querySelectorAll(".suggestion-item").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const id = el.dataset.id;
        const item = items.find((i) => String(i.id) === String(id));
        if (item) onSelect(item);
        container.style.display = "none";
        const input = PrimeScoreApp.getById(inputId);
        if (input) input.value = "";
      });
    });
  }

  function hideSuggestions(id) {
    const el = PrimeScoreApp.getById(id);
    if (el) el.style.display = "none";
  }

  // --- Debounced search handlers ---
  const searchTeams = PrimeScoreApp.debounce(async function (query) {
    if (query.length < 3) { hideSuggestions("favTeamsSuggestions"); return; }
    try {
      const data = await PrimeScoreApp.apiFetch(`/api/search?q=${encodeURIComponent(query)}&type=teams`);
      const items = (data.teams || []).map((t) => ({ id: t.id, name: t.name, crest: t.crest }));
      showSuggestions("favTeamsSuggestions", "favTeamsSearch", items, (item) => addFavItem("teams", item));
    } catch {
      hideSuggestions("favTeamsSuggestions");
    }
  }, 300);

  const searchPlayers = PrimeScoreApp.debounce(async function (query) {
    if (query.length < 3) { hideSuggestions("favPlayersSuggestions"); return; }
    try {
      const data = await PrimeScoreApp.apiFetch(`/api/search/players?q=${encodeURIComponent(query)}`);
      const items = (data.players || []).map((p) => ({ id: p.id, name: p.name, subtitle: p.team }));
      showSuggestions("favPlayersSuggestions", "favPlayersSearch", items, (item) => addFavItem("players", item));
    } catch {
      hideSuggestions("favPlayersSuggestions");
    }
  }, 300);

  const searchLeagues = PrimeScoreApp.debounce(async function (query) {
    if (query.length < 3) { hideSuggestions("favLeaguesSuggestions"); return; }
    try {
      const data = await PrimeScoreApp.apiFetch(`/api/search?q=${encodeURIComponent(query)}&type=competitions`);
      const items = (data.competitions || []).map((l) => ({ id: l.id, name: l.name }));
      showSuggestions("favLeaguesSuggestions", "favLeaguesSearch", items, (item) => addFavItem("leagues", item));
    } catch {
      hideSuggestions("favLeaguesSuggestions");
    }
  }, 300);

  function wireSearchInputs() {
    const configs = [
      { inputId: "favTeamsSearch", suggestionsId: "favTeamsSuggestions", handler: searchTeams },
      { inputId: "favPlayersSearch", suggestionsId: "favPlayersSuggestions", handler: searchPlayers },
      { inputId: "favLeaguesSearch", suggestionsId: "favLeaguesSuggestions", handler: searchLeagues },
    ];

    configs.forEach(({ inputId, suggestionsId, handler }) => {
      const input = PrimeScoreApp.getById(inputId);
      if (!input) return;
      input.addEventListener("input", (e) => handler(e.target.value.trim()));
      input.addEventListener("blur", () => setTimeout(() => hideSuggestions(suggestionsId), 150));
    });
  }

  // --- Resolve saved IDs to display names ---
  async function resolveTeam(id) {
    try {
      const data = await PrimeScoreApp.apiFetch(`/api/resolve/team-by-id?id=${encodeURIComponent(id)}`);
      return { id: data.id ?? id, name: data.name || `Team ${id}`, crest: data.crest };
    } catch {
      return { id, name: `Team ${id}` };
    }
  }

  async function resolvePlayer(id) {
    try {
      const data = await PrimeScoreApp.apiFetch(`/api/resolve/player-by-id?id=${encodeURIComponent(id)}`);
      return { id: data.id ?? id, name: data.name || `Player ${id}` };
    } catch {
      return { id, name: `Player ${id}` };
    }
  }

  async function resolveLeague(idOrCode) {
    if (LEGACY_LEAGUE_NAMES[idOrCode]) {
      return { id: idOrCode, name: LEGACY_LEAGUE_NAMES[idOrCode] };
    }
    try {
      const data = await PrimeScoreApp.apiFetch(`/api/resolve/league-by-id?id=${encodeURIComponent(idOrCode)}`);
      return { id: data.id ?? idOrCode, name: data.name || `League ${idOrCode}` };
    } catch {
      return { id: idOrCode, name: `League ${idOrCode}` };
    }
  }

  // --- Current favourites display (read-only) ---
  function renderFavouriteList(items, containerId) {
    const container = PrimeScoreApp.getById(containerId);
    if (!container) return;

    if (!items.length) {
      container.innerHTML = '<p class="message">None saved.</p>';
      return;
    }

    container.innerHTML = `
      <ul class="list">
        ${items
          .map((item) => {
            const name = typeof item === "object" ? item.name : item;
            const crest = typeof item === "object" ? item.crest : null;
            return `<li>
              ${crest ? `<img src="${PrimeScoreApp.escapeHtml(crest)}" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:6px;" alt="">` : ""}
              ${PrimeScoreApp.escapeHtml(String(name))}
            </li>`;
          })
          .join("")}
      </ul>`;
  }

  function renderFavourites() {
    renderFavouriteList(editState.teams, "favTeamsList");
    renderFavouriteList(editState.players, "favPlayersList");
    renderFavouriteList(editState.leagues, "favLeaguesList");
  }

  // --- Load ---
  async function loadFavourites() {
    try {
      const data = await PrimeScoreApp.apiFetch("/api/favourites");
      const teamIds = (data.favourite_teams || []).map(String);
      const playerIds = (data.favourite_players || []).map(String);
      const leagueIds = (data.favourite_leagues || []).map(String);

      const [teams, players, leagues] = await Promise.all([
        Promise.all(teamIds.map(resolveTeam)),
        Promise.all(playerIds.map(resolvePlayer)),
        Promise.all(leagueIds.map(resolveLeague)),
      ]);

      editState.teams = teams;
      editState.players = players;
      editState.leagues = leagues;

      renderFavourites();
      renderTags("teams");
      renderTags("players");
      renderTags("leagues");
      wireSearchInputs();
    } catch (error) {
      PrimeScoreApp.showMessage("favMsg", error.message || "Could not load favourites.");
    }
  }

  // --- Save ---
  async function saveFavourites(event) {
    event?.preventDefault();

    const payload = {
      favourite_teams: editState.teams.map((i) => i.id),
      favourite_players: editState.players.map((i) => i.id),
      favourite_leagues: editState.leagues.map((i) => String(i.id)),
    };

    try {
      await PrimeScoreApp.apiFetch("/api/favourites", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      renderFavourites();
      PrimeScoreApp.showMessage("favMsg", "Favourites saved.", false);
      PrimeScoreApp.loadFavouritesSummary?.();
    } catch (error) {
      PrimeScoreApp.showMessage("favMsg", error.message || "Could not save favourites.");
    }
  }

  PrimeScoreApp.loadFavourites = loadFavourites;
  PrimeScoreApp.renderFavourites = renderFavourites;
  PrimeScoreApp.saveFavourites = saveFavourites;
  PrimeScoreApp.removeFavItem = removeFavItem;
})(window.PrimeScoreApp);
