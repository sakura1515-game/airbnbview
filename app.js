// 🔑 비밀번호 7979
const APP_PIN = "7979";

// 새로 배포한 웹 앱 URL을 입력하세요.
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxNDr1gsZLOdxmIbrQLW8kQ4Y4G7RiTpNbIPBiQF8nX5cgkRoudVHa8711J6U-x1ud1/exec";

var globalData = null;
var currentRecFilter = 'all';
var profileSortMode = 'default';
var isTransposedMode = false;

window.onload = function() {
  if (localStorage.getItem("airbnb_auth_pin") === APP_PIN) {
    unlockApp();
  } else {
    document.getElementById("lock-screen").style.display = "flex";
  }

  document.getElementById("pin-input").addEventListener("keyup", function(e) {
    if (e.key === "Enter") verifyPin();
  });
};

function verifyPin() {
  var entered = document.getElementById("pin-input").value;
  if (entered === APP_PIN) {
    localStorage.setItem("airbnb_auth_pin", APP_PIN);
    unlockApp();
  } else {
    document.getElementById("pin-err").style.display = "block";
  }
}

function unlockApp() {
  document.getElementById("lock-screen").style.display = "none";
  fetchData();
}

function fetchData() {
  var loadingEl = document.getElementById('loading');
  loadingEl.style.display = 'block';
  loadingEl.innerHTML = '<div class="spinner"></div>시트 원본 데이터를 수신하는 중...';

  fetch(GAS_API_URL + "?t=" + new Date().getTime(), {
    method: "GET",
    redirect: "follow"
  })
  .then(function(res) {
    if (!res.ok) throw new Error("서버 응답 오류 (HTTP " + res.status + ")");
    return res.json();
  })
  .then(function(data) {
    if (data.error) throw new Error(data.message);

    // 💡 [핵심] 가공되지 않은 순수 원본 2차원 배열을 브라우저에서 직접 빌드
    globalData = parseRawSheetsData(data);

    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('updated-at').innerText = '기준: ' + (globalData.updatedAt || '-');

    renderTabProf();
    renderTabDash();
    renderTabRec();
    renderTabAudit();
  })
  .catch(function(err) {
    console.error(err);
    loadingEl.innerHTML = 
      '<div style="color:var(--red); padding:20px;">' +
      '⚠️ 데이터 로딩 실패<br><br>' +
      '<small style="color:var(--text-sub);">' + err.message + '</small><br><br>' +
      '<button class="switch-mode-btn" style="margin:0 auto;" onclick="fetchData()">다시 시도</button>' +
      '</div>';
  });
}

// ----------------------------------------------------
// 원본 2차원 시트 배열을 무손실로 앱 데이터로 조립하는 파서
// ----------------------------------------------------
function parseRawSheetsData(res) {
  var raw = res.raw || {};
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. 숙소 프로필 파싱 (숙소 프로필 시트 원본)
  var pSheet = raw.profile || [];
  var profiles = [];
  var myProfile = null;

  for (var pi = 1; pi < pSheet.length; pi++) {
    var pRow = pSheet[pi];
    if (!pRow[1] && !pRow[2]) continue;

    var parsePct = function(v) {
      var n = parseFloat(v) || 0;
      return n <= 1 && n > 0 ? n * 100 : n;
    };

    var cat = String(pRow[0] || '').trim();
    var tit = String(pRow[2] || '').trim();
    var isMy = cat.indexOf('내 숙소') !== -1 || cat.indexOf('내숙소') !== -1 || tit.indexOf('★내') !== -1 || pi === 1;

    var profObj = {
      category: cat,
      roomId: String(pRow[1] || '').trim(),
      title: tit,
      address: String(pRow[3] || '').trim(),
      spec: String(pRow[4] || '').trim(),
      rating: pRow[5] || '-',
      reviews: pRow[6] || 0,
      weekdayPrice: pRow[7] || 0,
      weekendPrice: pRow[8] || 0,
      extraPolicy: String(pRow[9] || '-'),
      mOcc: parsePct(pRow[10]),
      mWeekendOcc: parsePct(pRow[11]),
      mWeekdayOcc: parsePct(pRow[12]),
      occ60: parsePct(pRow[13]),
      weekendOcc60: parsePct(pRow[14]),
      weekdayOcc60: parsePct(pRow[15]),
      isMyRoom: isMy
    };

    if (isMy && !myProfile) {
      myProfile = profObj;
    } else {
      profiles.push(profObj);
    }
  }

  // 시장 평균 계산
  var marketAvg = { mOcc: 0, mWeekendOcc: 0, mWeekdayOcc: 0, occ60: 0 };
  if (profiles.length > 0) {
    var sMOcc = 0, sMWknd = 0, sMWkday = 0, s60 = 0;
    profiles.forEach(function(p) {
      sMOcc += p.mOcc;
      sMWknd += p.mWeekendOcc;
      sMWkday += p.mWeekdayOcc;
      s60 += p.occ60;
    });
    marketAvg.mOcc = (sMOcc / profiles.length).toFixed(1);
    marketAvg.mWeekendOcc = (sMWknd / profiles.length).toFixed(1);
    marketAvg.mWeekdayOcc = (sMWkday / profiles.length).toFixed(1);
    marketAvg.occ60 = (s60 / profiles.length).toFixed(1);
  }

  // 2. 종합 대시보드 원본 파싱 & 시장 마감률 자체 정밀 계산
  var dSheet = raw.dashboard || [];
  var dNotes = raw.dashboardNotes || [];
  var matrixData = { myRoomTitle: '내 숙소', compTitles: [], rows: [] };

  var headerRowIdx = 0;
  for (var hi = 0; hi < Math.min(4, dSheet.length); hi++) {
    if (String(dSheet[hi][0]).indexOf('날짜') !== -1) {
      headerRowIdx = hi;
      break;
    }
  }

  var hRow = dSheet[headerRowIdx] || [];
  var roomMeta = [];

  for (var c = 6; c < hRow.length; c += 2) {
    var fullTitle = String(hRow[c] || '').trim();
    if (!fullTitle) continue;

    var isMyRoom = fullTitle.indexOf('★내숙소') !== -1 || fullTitle.indexOf('★내 숙소') !== -1;
    var cleanTitle = fullTitle
      .replace(/\[★내숙소\]\s*/g, '')
      .replace(/\[★내 숙소\]\s*/g, '')
      .replace(/\s*상태\s*$/g, '')
      .replace(/^\[|\]$/g, '');

    if (cleanTitle.length > 7) cleanTitle = cleanTitle.substring(0, 7) + '..';

    var rInfo = { title: cleanTitle, isMy: isMyRoom, sCol: c, pCol: c + 1 };
    if (isMyRoom) {
      matrixData.myRoomTitle = cleanTitle;
      roomMeta.unshift(rInfo);
    } else {
      matrixData.compTitles.push(cleanTitle);
      roomMeta.push(rInfo);
    }
  }

  var totalRooms = roomMeta.length;

  for (var ri = headerRowIdx + 1; ri < dSheet.length; ri++) {
    var row = dSheet[ri];
    var nRow = dNotes[ri] || [];
    if (!row || !row[0]) continue;

    var rawDateStr = String(row[0]).trim();
    var mmdd = rawDateStr.length >= 10 ? rawDateStr.substring(5).replace('-', '/') : rawDateStr;

    var myData = { status: '-', price: '-', note: '' };
    var comps = [];
    var bookedRooms = 0;

    for (var k = 0; k < roomMeta.length; k++) {
      var meta = roomMeta[k];
      var sVal = String(row[meta.sCol] || '-').trim();
      var pRaw = row[meta.pCol];
      var pVal = formatCompactPrice(pRaw);
      var noteVal = String(nRow[meta.pCol] || '').trim();

      // 공실이 아니면 실제 마감으로 판정
      var isClosed = (sVal !== '-' && sVal !== '미확인' && sVal.indexOf('공실') === -1);
      if (isClosed) bookedRooms++;

      var cellObj = { status: sVal, price: pVal, note: noteVal };
      if (meta.isMy) {
        myData = cellObj;
      } else {
        comps.push(cellObj);
      }
    }

    var marketRateExact = totalRooms > 0 ? Math.round((bookedRooms / totalRooms) * 100) : 0;

    matrixData.rows.push({
      date: mmdd,
      fullDate: rawDateStr,
      weekday: String(row[1] || '').trim(),
      marketRate: marketRateExact,
      marketCount: bookedRooms + '/' + totalRooms,
      myRoom: myData,
      comps: comps
    });
  }

// ----------------------------------------------------
// 3. 가격 추천 & 진단 시트 원본 파싱 (인덱스 버그 수정)
// ----------------------------------------------------
  var recSheet = raw.recommendation || [];
  var dailyRecs = [];
  var urgentActions = [];

  for (var rj = 1; rj < recSheet.length; rj++) {
    var recRow = recSheet[rj];
    if (!recRow || !recRow[0]) continue;

    var dateStr = String(recRow[0]).trim();
    var tDate = new Date(dateStr);
    tDate.setHours(0, 0, 0, 0);

    var diffDays = !isNaN(tDate.getTime()) ? Math.round((tDate - today) / (1000 * 60 * 60 * 24)) : 999;
    var dDayStr = diffDays >= 0 ? 'D-' + diffDays : 'D+' + Math.abs(diffDays);

    var mmddShort = dateStr.length >= 10 ? dateStr.substring(5).replace('-', '/') : dateStr;
    var matchedM = matrixData.rows.find(function(mr) { return mr.date === mmddShort || mr.fullDate === dateStr; });

    var realMarketRate = matchedM ? matchedM.marketRate : 0;
    var myStatusStr = String(recRow[3] || '');
    var myPriceVal = recRow[4] || '-';
    var compAvgPrice = recRow[6] || '-';
    
    // 💡 [수정] 인덱스 교정: 10번이 '가격 진단 결과', 11번이 '권장 요금', 12번이 '추천 가이드'
    var suggestedPrice = recRow[11] || '-';
    var diagnosisStr = String(recRow[10] || '').trim();
    var actionStr = String(recRow[12] || '').trim();

    // 혹시 시트 열 구성이 달라 진단명이 숫자로 올 경우 기본 대체 텍스트 처리
    if (!diagnosisStr || /^\d+$/.test(diagnosisStr)) {
      diagnosisStr = (myStatusStr.indexOf('공실') !== -1) ? '적정 가격 유지' : '판매 완료';
    }

    var item = {
      date: dateStr,
      diffDays: diffDays,
      dDay: dDayStr,
      weekday: String(recRow[1] || ''),
      myStatus: myStatusStr,
      myPrice: myPriceVal,
      marketRate: realMarketRate,
      avgCompPrice: compAvgPrice,
      suggestedPrice: suggestedPrice,
      diagnosis: diagnosisStr,
      action: actionStr
    };

    dailyRecs.push(item);

    // 긴급 권장 조치 자동 판정 (내 숙소 공실 기준)
    if (myStatusStr.indexOf('공실') !== -1) {
      var numMyP = parseInt(String(myPriceVal).replace(/[^\d]/g, ''), 10) || 0;
      var numAvgP = parseInt(String(compAvgPrice).replace(/[^\d]/g, ''), 10) || 0;

      if (diffDays <= 3 && realMarketRate < 60) {
        item.diagnosis = '직전 공실 위험 (수요 부진)';
        var refP = numAvgP > 0 ? numAvgP : numMyP;
        item.suggestedPrice = Math.max(Math.round((refP * 0.8) / 1000) * 1000, 50000);
        item.action = '체크인 ' + dDayStr + ' 임박 및 시장 침체. 약 15~20% 할인으로 공실 손실 방어 권장';
        urgentActions.push(item);
      } else if (realMarketRate >= 70) {
        item.diagnosis = '공급 부족 (수요 강세)';
        item.suggestedPrice = Math.max(numMyP, numAvgP > 0 ? Math.round((numAvgP * 1.1) / 1000) * 1000 : numMyP);
        item.action = '주변 숙소 마감률 ' + realMarketRate + '% 돌파! 잔여 객실 희소로 프리미엄 인상 권장';
        urgentActions.push(item);
      } else if (numAvgP > 0 && numMyP > numAvgP * 1.25) {
        item.diagnosis = '주변 대비 고평가 (공실 우려)';
        item.suggestedPrice = Math.round((numAvgP * 1.02) / 1000) * 1000;
        item.action = '경쟁사 평균가보다 25% 이상 높아 예약 저항 가능성. 평균 수준으로 현실화 권장';
        urgentActions.push(item);
      }
    }
  }

  urgentActions.sort(function(a, b) { return a.diffDays - b.diffDays; });

  // 4. 숙소 진단 리포트 시트 원본 파싱
  var aSheet = raw.audit || [];
  var auditSections = [];
  var curSec = null;

  for (var ai = 0; ai < aSheet.length; ai++) {
    var aRow = aSheet[ai];
    var fCell = String(aRow[0] || '').trim();
    if (!fCell && !aRow[1]) continue;

    if (fCell.indexOf('[') === 0 || fCell.indexOf('■') === 0 || fCell.indexOf('▶') === 0) {
      curSec = { title: fCell, rows: [] };
      auditSections.push(curSec);
    } else if (curSec) {
      var clean = aRow.filter(function(c, idx) { return idx < 6; });
      if (clean.some(function(v) { return v !== ''; })) {
        curSec.rows.push(clean);
      }
    }
  }

  return {
    updatedAt: res.updatedAt || '-',
    myProfile: myProfile,
    profiles: profiles,
    marketAvg: marketAvg,
    urgentActions: urgentActions,
    dailyRecs: dailyRecs,
    matrixData: matrixData,
    auditSections: auditSections
  };
}

function switchTab(tabId, el) {
  document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
  document.querySelectorAll('.tab-item').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('tab-' + tabId).classList.add('active');
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

// ----------------------------------------------------
// 대시보드 렌더링
// ----------------------------------------------------
function toggleMatrixMode() {
  isTransposedMode = !isTransposedMode;
  var guideText = document.getElementById('matrix-guide-text');
  var btnText = document.getElementById('btn-mode-text');

  if (isTransposedMode) {
    guideText.innerText = '숙소(세로) 뷰 (상단 3개 행 고정)';
    btnText.innerText = '날짜 기준(세로 스크롤)';
  } else {
    guideText.innerText = '날짜(세로) 뷰 (3열 고정)';
    btnText.innerText = '숙소 기준(가로 타임라인)';
  }
  renderTabDash();
}

function renderTabDash() {
  if (isTransposedMode) {
    renderTransposedDash();
  } else {
    renderStandardDash();
  }
}

function renderStandardDash() {
  var m = globalData.matrixData;
  if (!m || !m.rows || m.rows.length === 0) return;

  var hHtml = '<tr><th class="col-fixed-1">날짜</th><th class="col-fixed-2">시장</th>' +
              '<th class="col-fixed-3"><span class="room-clickable" onclick="goToProfile(\'my\')">★' + m.myRoomTitle + '</span></th>';

  m.compTitles.forEach(function(title, idx) {
    hHtml += '<th class="col-comp"><span class="room-clickable" onclick="goToProfile(' + idx + ')">' + title + '</span></th>';
  });
  hHtml += '</tr>';
  document.getElementById('matrix-head').innerHTML = hHtml;

  var bHtml = '';
  m.rows.forEach(function(row) {
    var dayCls = (row.weekday === '토') ? 'day-sat' : ((row.weekday === '일') ? 'day-sun' : '');

    bHtml += '<tr>' +
      '<td class="col-fixed-1"><div>' + row.date + '</div><div class="' + dayCls + '" style="font-size:0.62rem;">(' + row.weekday + ')</div></td>' +
      '<td class="col-fixed-2"><div style="color:var(--yellow);font-weight:700;">' + row.marketRate + '%</div><div style="font-size:0.6rem;color:var(--text-sub);">' + row.marketCount + '</div></td>' +
      '<td class="col-fixed-3">' + makeCellContent(row.myRoom) + '</td>';

    row.comps.forEach(function(cRoom) { bHtml += '<td class="col-comp">' + makeCellContent(cRoom) + '</td>'; });
    bHtml += '</tr>';
  });
  document.getElementById('matrix-body').innerHTML = bHtml;
}

function renderTransposedDash() {
  var m = globalData.matrixData;
  if (!m || !m.rows || m.rows.length === 0) return;

  var hHtml = '<tr><th class="col-fixed-trans">숙소 목록</th>';
  m.rows.forEach(function(r) {
    var dayCls = (r.weekday === '토') ? 'day-sat' : ((r.weekday === '일') ? 'day-sun' : '');
    hHtml += '<th class="col-day-trans"><div>' + r.date + '</div><div class="' + dayCls + '" style="font-size:0.62rem;">(' + r.weekday + ')</div></th>';
  });
  hHtml += '</tr>';
  document.getElementById('matrix-head').innerHTML = hHtml;

  var bHtml = '';

  bHtml += '<tr class="row-sticky-market"><td class="col-fixed-trans" style="color:var(--yellow);">📈 시장마감</td>';
  m.rows.forEach(function(r) {
    bHtml += '<td class="col-day-trans"><div style="color:var(--yellow);font-weight:700;">' + r.marketRate + '%</div><div style="font-size:0.6rem;color:var(--text-sub);">' + r.marketCount + '</div></td>';
  });
  bHtml += '</tr>';

  bHtml += '<tr class="row-sticky-my"><td class="col-fixed-trans is-my"><span class="room-clickable" onclick="goToProfile(\'my\')">★ ' + m.myRoomTitle + '</span></td>';
  m.rows.forEach(function(r) {
    bHtml += '<td class="col-day-trans">' + makeCellContent(r.myRoom) + '</td>';
  });
  bHtml += '</tr>';

  m.compTitles.forEach(function(title, cIdx) {
    bHtml += '<tr><td class="col-fixed-trans"><span class="room-clickable" onclick="goToProfile(' + cIdx + ')">' + title + '</span></td>';
    m.rows.forEach(function(r) {
      bHtml += '<td class="col-day-trans">' + makeCellContent(r.comps[cIdx]) + '</td>';
    });
    bHtml += '</tr>';
  });

  document.getElementById('matrix-body').innerHTML = bHtml;
}

function makeCellContent(room) {
  if (!room) return '-';
  var s = String(room.status || '-');
  var p = room.price || '-';
  var note = String(room.note || '').trim();

  var bCls = 'status-booked';
  if (s.indexOf('공실') !== -1) {
    bCls = 'status-vacant';
    if (s.indexOf('▼') !== -1) bCls += ' badge-down';
    else if (s.indexOf('▲') !== -1) bCls += ' badge-up';
  } else if (s.indexOf('마감') !== -1) {
    bCls = 'status-closed';
  }

  var shortStatus = s;
  if (s === '공실') shortStatus = '공실';

  var hasNoteCls = note ? ' has-note' : '';
  var noteAttr = note ? ' data-note="' + encodeURIComponent(note) + '"' : '';

  return '<div class="cell-box' + hasNoteCls + '"' + noteAttr + '>' +
           '<span class="cell-badge ' + bCls + '">' + shortStatus + '</span>' +
           '<span class="cell-price">' + p + '</span>' +
         '</div>';
}

function goToProfile(target) {
  var profTabBtn = document.querySelectorAll('.tab-item')[0];
  switchTab('prof', profTabBtn);

  setTimeout(function() {
    var targetCard = null;
    if (target === 'my') {
      targetCard = document.getElementById('prof-card-my');
    } else {
      var compProfiles = globalData.profiles || [];
      var comp = compProfiles[target];
      if (comp) {
        targetCard = document.getElementById('prof-card-' + (comp.roomId || target));
        if (!targetCard) {
          var allCards = document.querySelectorAll('#profiles-container .p-card');
          allCards.forEach(function(card) {
            if (card.getAttribute('data-title') && card.getAttribute('data-title').indexOf(comp.title) !== -1) {
              targetCard = card;
            }
          });
        }
      }
    }

    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetCard.classList.remove('highlight-target');
      void targetCard.offsetWidth;
      targetCard.classList.add('highlight-target');
    }
  }, 120);
}

// ----------------------------------------------------
// 가격 추천 & 액션 보드 탭 렌더링
// ----------------------------------------------------
// ----------------------------------------------------
// 가격 추천 & 액션 보드 탭 렌더링 (가시성 & 색상 강화)
// ----------------------------------------------------
function renderTabRec() {
  if (globalData.myProfile && globalData.marketAvg) {
    var p = globalData.myProfile;
    var m = globalData.marketAvg;

    // D-7 이내 미판매 일수 집계
    var d7VacantCount = 0;
    (globalData.dailyRecs || []).forEach(function(it) {
      if (it.diffDays >= 0 && it.diffDays <= 7) {
        if (String(it.myStatus).indexOf('공실') !== -1) {
          d7VacantCount++;
        }
      }
    });
    document.getElementById('kpi-d7').innerText = d7VacantCount + '일';

    // 30일 평일, 주말, 60일 전체 점유율
    setKpi('kpi-wkday', 'diff-wkday', Number(p.mWeekdayOcc || 0), Number(m.mWeekdayOcc || 0));
    setKpi('kpi-wknd', 'diff-wknd', Number(p.mWeekendOcc || 0), Number(m.mWeekendOcc || 0));
    setKpi('kpi-60', 'diff-60', Number(p.occ60 || 0), Number(m.occ60 || 0));
  }

  renderUrgentActionCards();
  renderRecList();
}

function setKpi(vId, dId, myV, avgV) {
  document.getElementById(vId).innerText = myV.toFixed(1) + '%';
  var diff = (myV - avgV).toFixed(1);
  var el = document.getElementById(dId);
  el.innerText = '시장 대비 ' + (diff >= 0 ? '+' : '') + diff + '%p';
}

function renderUrgentActionCards() {
  var cont = document.getElementById('urgent-list');
  var actions = globalData.urgentActions || [];

  if (actions.length === 0) {
    cont.innerHTML = '<div style="background:var(--card-bg); border:1px solid var(--card-border); border-radius:10px; padding:16px; text-align:center; font-size:0.75rem; color:var(--text-sub);">현재 긴급 조정이 필요한 날짜가 없습니다. 적정 요금을 유지하고 있습니다.</div>';
    return;
  }

  var html = '';
  actions.slice(0, 3).forEach(function(it) {
    var diag = String(it.diagnosis || '');
    var cardCls = 'action-card warning';
    var tagCls = 'tag-yellow';
    var tagEmoji = '⚠️';
    var targetCls = 'yellow';
    var diffCls = 'diff-yellow';

    var myP = parseInt(String(it.myPrice).replace(/[^\d]/g, ''), 10) || 0;
    var suggP = parseInt(String(it.suggestedPrice).replace(/[^\d]/g, ''), 10) || 0;
    var diffText = '';

    if (diag.indexOf('위험') !== -1 || diag.indexOf('직전 공실') !== -1) {
      cardCls = 'action-card urgent';
      tagCls = 'tag-red';
      tagEmoji = '🚨';
      targetCls = 'down';
      diffCls = 'diff-down';
      if (myP > 0 && suggP > 0) {
        var pct = Math.round(((myP - suggP) / myP) * 100);
        diffText = '-' + pct + '% 할인';
      }
    } else if (diag.indexOf('수요') !== -1 || diag.indexOf('인상') !== -1 || diag.indexOf('부족') !== -1) {
      cardCls = 'action-card opportunity';
      tagCls = 'tag-green';
      tagEmoji = '🔥';
      targetCls = 'up';
      diffCls = 'diff-up';
      if (myP > 0 && suggP > 0) {
        var diffVal = suggP - myP;
        diffText = '+' + fmtPrice(diffVal) + ' 인상';
      }
    } else {
      diffText = '-₩13,000 조정';
    }

    html += '<div class="' + cardCls + '">' +
      '<div class="card-top">' +
        '<span class="date-badge">' + String(it.date).substring(5) + ' (' + it.weekday + ') <small>' + it.dDay + '</small></span>' +
        '<span class="tag ' + tagCls + '">' + tagEmoji + ' ' + diag + '</span>' +
      '</div>' +
      '<div class="price-compare">' +
        '<span class="price-curr">' + fmtPrice(it.myPrice) + '</span>' +
        '<span class="price-target ' + targetCls + '">' + fmtPrice(it.suggestedPrice) + '</span>' +
        '<span class="diff-badge ' + diffCls + '">' + diffText + '</span>' +
      '</div>' +
      '<div class="guide-text">' + (it.action || it.diagnosis || '주변 경쟁가 대비 요금 조정을 권장합니다.') + '</div>' +
    '</div>';
  });

  cont.innerHTML = html;
}

function setRecFilter(mode, btn) {
  currentRecFilter = mode;
  document.querySelectorAll('#tab-rec .filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderRecList();
}

// ----------------------------------------------------
// renderRecList (마감 톤다운 & 회색톤 날짜 컬러 적용)
// ----------------------------------------------------
function renderRecList() {
  var cont = document.getElementById('daily-rec-container');
  var list = globalData.dailyRecs || [];
  var matrixRows = (globalData.matrixData && globalData.matrixData.rows) ? globalData.matrixData.rows : [];
  var compTitles = (globalData.matrixData && globalData.matrixData.compTitles) ? globalData.matrixData.compTitles : [];

  var filtered = list.filter(function(d) {
    if (currentRecFilter === 'my_vacant') return String(d.myStatus).indexOf('공실') !== -1;
    if (currentRecFilter === 'weekday') return d.weekday !== '금' && d.weekday !== '토';
    if (currentRecFilter === 'weekend') return d.weekday === '금' || d.weekday === '토';
    return true;
  });

  var html = '';

  filtered.forEach(function(d) {
    var isMyVacant = String(d.myStatus).indexOf('공실') !== -1;
    var badgeCls = isMyVacant ? 'badge-vacant' : 'badge-booked';
    var statusText = isMyVacant ? '내방 공실' : '내방 마감';

    var dateParts = String(d.date).split('-');
    var mmdd = dateParts.length >= 3 ? dateParts[1] + '/' + dateParts[2] : d.date;

    var isSat = d.weekday === '토';
    var isSun = d.weekday === '일';

    // 💡 [개선] 마감된 날짜는 전체 톤다운 + 회색톤의 블루/레드 적용
    var itemRowCls = isMyVacant ? 'daily-item' : 'daily-item is-booked-row';
    var dateColorCls = '';

    if (isMyVacant) {
      dateColorCls = isSat ? 'day-sat-vivid' : (isSun ? 'day-sun-vivid' : 'day-normal-vivid');
    } else {
      dateColorCls = isSat ? 'day-sat-muted' : (isSun ? 'day-sun-muted' : 'day-normal-muted');
    }

    var myP = parseInt(String(d.myPrice).replace(/[^\d]/g, ''), 10) || 0;
    var suggP = parseInt(String(d.suggestedPrice).replace(/[^\d]/g, ''), 10) || 0;

    var suggHtml = '-';
    var suggCls = '';
    var diagColor = 'var(--text-sub)';

    if (isMyVacant && d.suggestedPrice !== '-') {
      if (suggP < myP && suggP > 0) {
        suggCls = 'd-sugg-down';
        diagColor = 'var(--red)';
      } else if (suggP > myP) {
        suggCls = 'd-sugg-up';
        diagColor = 'var(--green)';
      }
      suggHtml = '➔ ' + fmtPrice(d.suggestedPrice);
    }

    var matchingMRow = matrixRows.find(function(mr) {
      return mr.date === mmdd || d.date.indexOf(mr.date) !== -1;
    });

    var compChipsHtml = '';
    if (matchingMRow && matchingMRow.comps) {
      var vacantComps = [];
      matchingMRow.comps.forEach(function(c, cIdx) {
        if (String(c.status).indexOf('공실') !== -1) {
          vacantComps.push({
            idx: cIdx,
            name: compTitles[cIdx] || ('경쟁 숙소 ' + (cIdx + 1)),
            price: c.price
          });
        }
      });

      if (vacantComps.length > 0) {
        compChipsHtml += '<div class="comp-scroll-wrapper"><span class="comp-scroll-label">경쟁공실(' + vacantComps.length + '):</span>';
        vacantComps.forEach(function(vc) {
          compChipsHtml += '<div class="comp-chip" onclick="goToProfile(' + vc.idx + ')">' +
            '<span class="chip-name">' + vc.name + '</span>' +
            '<span class="chip-price">' + vc.price + '</span>' +
          '</div>';
        });
        compChipsHtml += '</div>';
      } else {
        compChipsHtml += '<div class="comp-scroll-wrapper"><span class="comp-scroll-label">경쟁공실:</span><span class="chip-none">주변 전 객실 마감완료</span></div>';
      }
    }

    html += '<div class="' + itemRowCls + '">' +
      '<div class="daily-main-row">' +
        '<div class="date-box">' +
          '<div class="d-day-num ' + dateColorCls + '">' + mmdd + '</div>' +
          '<div class="d-day-sub ' + dateColorCls + '">' + d.dDay + ' (' + d.weekday + ')</div>' +
        '</div>' +
        '<div class="diag-box">' +
          '<span class="' + badgeCls + '">' + statusText + '</span>' +
          '<div class="d-diag-text" style="color:' + diagColor + ';">' + d.diagnosis + '</div>' +
        '</div>' +
        '<div class="price-box">' +
          '<div class="d-curr-price">' + fmtPrice(d.myPrice) + '</div>' +
          '<div class="d-sugg-price ' + suggCls + '">' + suggHtml + '</div>' +
          '<div class="d-market-rate">시장마감 ' + d.marketRate + '%</div>' +
        '</div>' +
      '</div>' +
      compChipsHtml +
    '</div>';
  });

  cont.innerHTML = html || '<div style="text-align:center;padding:24px;color:var(--text-sub);">해당 필터 조건의 내역이 없습니다.</div>';
}

// ----------------------------------------------------
// 숙소 프로필 탭 렌더링 (네이버 지도 앱 연동 반영)
// ----------------------------------------------------
function sortProfiles(mode, btn) {
  profileSortMode = mode;
  document.querySelectorAll('#tab-prof .filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderTabProf();
}

function renderTabProf() {
  var cont = document.getElementById('profiles-container');
  var list = [];
  if (globalData.myProfile) list.push(globalData.myProfile);
  if (globalData.profiles) list = list.concat(globalData.profiles);

  var my = list.filter(function(p) { return p.isMyRoom; });
  var comps = list.filter(function(p) { return !p.isMyRoom; });

  if (profileSortMode === 'occ') {
    comps.sort(function(a, b) { return Number(b.mOcc || 0) - Number(a.mOcc || 0); });
  } else if (profileSortMode === 'price') {
    comps.sort(function(a, b) {
      var pA = parseInt(String(a.weekdayPrice).replace(/[^\d]/g, ''), 10) || 0;
      var pB = parseInt(String(b.weekdayPrice).replace(/[^\d]/g, ''), 10) || 0;
      return pA - pB;
    });
  }

  var displayList = my.concat(comps);
  var html = '';

  displayList.forEach(function(p, idx) {
    var isMy = p.isMyRoom;
    var cardCls = isMy ? 'p-card is-my' : 'p-card';
    var badgeCls = isMy ? 'p-badge badge-my' : 'p-badge badge-comp';
    var badgeText = isMy ? '★ 내 숙소' : (p.category || '경쟁사');
    var airbnbUrl = p.roomId ? 'https://www.airbnb.co.kr/rooms/' + p.roomId : '#';

    var mOccVal = Number(p.mOcc || 0);
    var occ60Val = Number(p.occ60 || 0);
    var mWkndVal = Number(p.mWeekendOcc || 0);
    var wknd60Val = Number(p.weekendOcc60 || 0);
    var mWkdayVal = Number(p.mWeekdayOcc || 0);
    var wkday60Val = Number(p.weekdayOcc60 || 0);

    var cardId = isMy ? 'prof-card-my' : ('prof-card-' + (p.roomId || idx));

    // 💡 [신규] 네이버 지도 앱/웹 검색 URL 생성
    var rawAddr = String(p.address || '').trim();
    var mapHtml = '<span>주소 정보 없음</span>';

    if (rawAddr && rawAddr !== '주소 정보 없음' && rawAddr !== '-') {
      var encodedAddr = encodeURIComponent(rawAddr);
      var naverMapUrl = 'https://map.naver.com/v5/search/' + encodedAddr;
      mapHtml = '<a href="' + naverMapUrl + '" target="_blank" class="map-link">' +
                  rawAddr + ' <span class="map-icon">N지도↗</span>' +
                '</a>';
    }

    html += '<div id="' + cardId + '" class="' + cardCls + '" data-title="' + p.title + '">' +
      '<div class="p-header">' +
        '<a href="' + airbnbUrl + '" target="_blank" class="p-title-link">' +
          p.title + ' <span style="font-size:0.75rem; color:var(--accent);">↗</span>' +
        '</a>' +
        '<span class="' + badgeCls + '">' + badgeText + '</span>' +
      '</div>' +
      '<div class="p-specs">' +
        '<div>📍 ' + mapHtml + '</div>' +
        '<div>🏠 ' + (p.spec || '-') + ' | ⭐ ' + p.rating + ' (후기 ' + p.reviews + '개)</div>' +
      '</div>' +
      '<div class="p-pricing-box">' +
        '<div class="p-price-row">' +
          '<span>평일 <strong>' + fmtPrice(p.weekdayPrice) + '</strong></span>' +
          '<span>주말 <strong>' + fmtPrice(p.weekendPrice) + '</strong></span>' +
        '</div>' +
        '<div style="font-size:0.72rem; color:var(--accent);">👥 인원 정책: ' + (p.extraPolicy || '기준 인원 요금') + '</div>' +
      '</div>' +
      '<table class="p-matrix">' +
        '<thead><tr><th style="width:34%;">구분</th><th style="width:33%;">1개월 (30일)</th><th style="width:33%;">전체 (60일)</th></tr></thead>' +
        '<tbody>' +
          '<tr><td><strong>종합 점유율</strong></td><td><span class="' + getOccClass(mOccVal) + '">' + mOccVal.toFixed(1) + '%</span></td><td><span class="' + getOccClass(occ60Val) + '">' + occ60Val.toFixed(1) + '%</span></td></tr>' +
          '<tr><td>주말 점유율</td><td>' + mWkndVal.toFixed(0) + '%</td><td>' + wknd60Val.toFixed(0) + '%</td></tr>' +
          '<tr><td>평일 점유율</td><td>' + mWkdayVal.toFixed(0) + '%</td><td>' + wkday60Val.toFixed(0) + '%</td></tr>' +
        '</tbody>' +
      '</table>' +
    '</div>';
  });

  cont.innerHTML = html;
}

function getOccClass(val) {
  if (val >= 75) return 'occ-high';
  if (val >= 50) return 'occ-mid';
  return 'occ-low';
}

// ----------------------------------------------------
// 진단 리포트 탭 렌더링
// ----------------------------------------------------
function renderTabAudit() {
  var cont = document.getElementById('audit-container');
  var sec = globalData.auditSections || [];
  if (sec.length === 0) {
    cont.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sub);">진단 데이터 없음</div>';
    return;
  }

  var html = '';
  sec.forEach(function(s) {
    html += '<div style="margin-bottom:14px;"><div style="font-size:0.85rem;font-weight:700;color:var(--accent);margin-bottom:6px;">' + s.title + '</div>' +
      '<table class="audit-table">';
    s.rows.forEach(function(row, rIdx) {
      html += '<tr>';
      row.forEach(function(c) {
        html += (rIdx === 0 && isNaN(parseInt(c, 10))) ? '<th>' + c + '</th>' : '<td>' + c + '</td>';
      });
      html += '</tr>';
    });
    html += '</table></div>';
  });
  cont.innerHTML = html;
}

function fmtPrice(v) {
  if (!v || v === '-') return '-';
  var n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? v : '₩' + n.toLocaleString();
}

function formatCompactPrice(val) {
  if (!val || val === '-' || val === '0') return '-';
  var num = parseInt(String(val).replace(/[^\d]/g, ''), 10);
  if (isNaN(num) || num === 0) return '-';
  if (num >= 10000) {
    var man = (num / 10000).toFixed(1);
    return (man.endsWith('.0') ? parseInt(man, 10) : man) + '만';
  }
  return (num / 1000).toFixed(0) + '천';
}

// ----------------------------------------------------
// 구글 시트 메모(Note) 툴팁 이벤트
// ----------------------------------------------------
var tooltipEl = null;

function getOrCreateTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'note-tooltip';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function showNoteTooltip(e, noteText) {
  var tip = getOrCreateTooltip();
  tip.innerText = decodeURIComponent(noteText);
  tip.style.display = 'block';

  var cell = e.target.closest('.cell-box');
  if (!cell) return;
  var rect = cell.getBoundingClientRect();
  var tipWidth = 230;

  var left = rect.left + window.scrollX;
  if (left + tipWidth > window.innerWidth) {
    left = window.innerWidth - tipWidth - 16;
  }
  if (left < 10) left = 10;

  var top = rect.top - 10;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.style.transform = 'translateY(-100%)';

  if (rect.top < 80) {
    tip.style.top = (rect.bottom + 8) + 'px';
    tip.style.transform = 'none';
  }
}

function hideNoteTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

document.addEventListener('mouseover', function(e) {
  var target = e.target.closest('.cell-box.has-note');
  if (target) {
    var note = target.getAttribute('data-note');
    if (note) showNoteTooltip(e, note);
  }
});

document.addEventListener('mouseout', function(e) {
  if (e.target.closest('.cell-box.has-note')) {
    hideNoteTooltip();
  }
});

document.addEventListener('click', function(e) {
  var target = e.target.closest('.cell-box.has-note');
  if (target) {
    var note = target.getAttribute('data-note');
    if (note) {
      e.stopPropagation();
      showNoteTooltip(e, note);
    }
  } else {
    hideNoteTooltip();
  }
});