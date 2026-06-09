// Copie exacte de computeAlertesSaisies extraite de index.html (ligne ~16480).
// A garder synchro avec l'app jusqu'au jour ou on splittera le mega index.html.
// IMPORTANT : si tu modifies la fonction cote app, copie-la ici aussi (et lance les tests).

export function computeAlertesSaisies(args) {
  var today          = args.today;
  var daysWindow     = args.daysWindow != null ? args.daysWindow : 7;
  var startDateStr   = args.startDate || null;
  var chantiers      = args.chantiers || [];
  var equipements    = args.equipements || [];
  var chantierEquips = args.chantierEquipements || [];
  var rapports       = args.rapports || [];
  var heures         = args.heures || [];
  var saisies        = args.saisies || {};
  var minHeures      = args.minHeures != null ? args.minHeures : 3;

  function toYMD(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var j = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + j;
  }
  function ymdOnly(s) { return String(s || "").substring(0, 10); }

  var days = [];
  var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  yesterday.setDate(yesterday.getDate() - 1);
  if (startDateStr) {
    var parts = startDateStr.split("-");
    var startD = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var cur = new Date(startD.getTime());
    var safe = 0;
    while (cur.getTime() <= yesterday.getTime() && safe < 400) {
      var dow0 = cur.getDay();
      if (dow0 >= 1 && dow0 <= 5) days.push(toYMD(cur));
      cur.setDate(cur.getDate() + 1);
      safe++;
    }
  } else {
    var cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (var step = 1; days.length < daysWindow && step < daysWindow * 3; step++) {
      var d = new Date(cursor.getTime());
      d.setDate(d.getDate() - step);
      var dow = d.getDay();
      if (dow >= 1 && dow <= 5) days.push(toYMD(d));
    }
    days.sort();
  }
  if (!days.length) return { list: [], count: 0, daysChecked: [] };

  var chantById = {};
  chantiers.forEach(function(c) { chantById[String(c.id)] = c; });
  var chantStatut = function(c) {
    var st = String((c && (c.statut || c.Statut)) || "").toLowerCase();
    return st;
  };

  var eqById = {};
  var eqCodeById = {};
  equipements.forEach(function(e) {
    eqById[e.Id] = e;
    if (e.Id != null) eqCodeById[e.Id] = String(e.Title || "").trim().toUpperCase();
  });

  var rapByDayMach = {};
  rapports.forEach(function(r) {
    var d = ymdOnly(r.date_rapport);
    var code = String(r.sondeuse_code || "").trim().toUpperCase();
    if (!d || !code) return;
    rapByDayMach[d + "|" + code] = (rapByDayMach[d + "|" + code] || 0) + 1;
  });

  var heuresByDayEqId = {};
  var heuresByDayMach = {};
  heures.forEach(function(h0) {
    var d = ymdOnly(h0.date_releve);
    if (!d) return;
    if (h0.equipement_id != null) {
      var k = d + "|" + String(h0.equipement_id);
      heuresByDayEqId[k] = (heuresByDayEqId[k] || 0) + 1;
    }
    if (h0.sondeuse_code) {
      var code2 = String(h0.sondeuse_code).trim().toUpperCase();
      var k2 = d + "|" + code2;
      heuresByDayMach[k2] = (heuresByDayMach[k2] || 0) + 1;
    }
  });

  function isJourProductif(chantierId, dayStr) {
    var byChant = saisies[chantierId] || saisies[String(chantierId)];
    if (!byChant) return false;
    var entry = byChant[dayStr];
    if (entry == null) return false;
    if (typeof entry === "object") {
      var tj = entry.typeJour || "normal";
      if (tj !== "normal") return false;
      var v = parseFloat(entry.valeur || 0);
      return v > 0;
    }
    return parseFloat(entry || 0) > 0;
  }

  var items = [];
  days.forEach(function(dayStr) {
    var perDay = [];
    chantierEquips.forEach(function(ce) {
      var dd = ymdOnly(ce.dateDebut);
      var df = ymdOnly(ce.dateFin);
      if (dd && dayStr < dd) return;
      if (df && dayStr > df) return;
      var ch = chantById[String(ce.chantierId)];
      if (!ch) return;
      var st = chantStatut(ch);
      if (st.indexOf("archiv") >= 0 || st.indexOf("termin") >= 0 || st.indexOf("clos") >= 0) return;
      if (!isJourProductif(ce.chantierId, dayStr)) return;
      var eq = eqById[ce.equipementId];
      if (!eq) return;
      var code = eqCodeById[ce.equipementId] || "";
      var kMach = dayStr + "|" + code;
      var kEqId = dayStr + "|" + String(ce.equipementId);
      var hasRap = code ? (rapByDayMach[kMach] > 0) : false;
      var nbH = Math.max(heuresByDayEqId[kEqId] || 0, heuresByDayMach[kMach] || 0);
      var missing = [];
      if (!hasRap)  missing.push("rapport");
      if (nbH < minHeures) missing.push("heures(" + nbH + "/" + minHeures + ")");
      if (missing.length > 0) {
        perDay.push({
          date: dayStr,
          chantierId: ce.chantierId,
          chantierLabel: ch.titre || ch.nom || ("Chantier #" + ce.chantierId),
          equipementId: ce.equipementId,
          equipementCode: code || (eq.Title || ""),
          missing: missing,
          hasRapport: hasRap,
          nbHeures: nbH,
          minHeures: minHeures
        });
      }
    });
    if (perDay.length > 0) items.push({ date: dayStr, items: perDay });
  });

  items.sort(function(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  var total = items.reduce(function(s, g) { return s + g.items.length; }, 0);
  return { list: items, count: total, daysChecked: days };
}
