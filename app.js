// 🔑 비밀번호 7979로 설정
const APP_PIN = "7979";

// 연동된 구글 웹 앱 URL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbz7j5nskLw2d6B4o39eldVbDHa_6fTSdVSNOQliiXP06GkmXH4kb2KoayjUcB35XO4v/exec";

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
  loadingEl.innerHTML = '<div class="spinner"></div>시트 데이터를 분석하는 중...';

  // 타임스탬프 파라미터로 모바일 브라우저 캐시 방지
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
    onDataLoaded(data);
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

function onDataLoaded(data) {
  globalData = data;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('updated-at').innerText = '기준: ' + (data.updatedAt || '-');

  renderTabDash();
  renderTabRec();
  renderTabProf();
  renderTabAudit();
}

function switchTab(tabId, el) {
  document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
  document.querySelectorAll('.tab-item').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('tab-' + tabId).classList.add('active');
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

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

// 모드 1: 기본 날짜 기준 뷰
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

// 모드 2: 숙소 기준 타임라인 뷰
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
    // 가격 할인/인상 뱃지 색상 세분화
    if (s.indexOf('▼') !== -1) bCls += ' badge-down';
    else if (s.indexOf('▲') !== -1) bCls += ' badge-up';
  } else if (s.indexOf('마감') !== -1) {
    bCls = 'status-closed';
  }

  // 텍스트 간소화 (예: '공실(▼1.5만)'은 그대로 살려 변동폭 노출)
  var shortStatus = s;
  if (s === '공실') shortStatus = '공실';

  var hasNoteCls = note ? ' has-note' : '';
  // 메모가 있을 경우 data-note 속성에 저장
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

// 2. 가격 추천 탭
function renderTabRec() {
  if (globalData.myProfile && globalData.marketAvg) {
    var p = globalData.myProfile;
    var m = globalData.marketAvg;
    setKpi('kpi-30', 'diff-30', Number(p.mOcc || 0), Number(m.mOcc || 0));
    setKpi('kpi-wknd', 'diff-wknd', Number(p.mWeekendOcc || 0), Number(m.mWeekendOcc || 0));
    setKpi('kpi-60', 'diff-60', Number(p.occ60 || 0), Number(m.occ60 || 0));
  }

  if (globalData.urgentActions && globalData.urgentActions.length > 0) {
    document.getElementById('urgent-card').style.display = 'block';
    var uHtml = '';
    globalData.urgentActions.forEach(function(it) {
      uHtml += '<div class="action-item"><div class="action-top">' +
        '<span>[' + it.dDay + '] ' + String(it.date).substring(5) + '(' + it.weekday + ')</span>' +
        '<span class="action-price">' + fmtPrice(it.suggestedPrice) + '</span></div>' +
        '<div class="action-desc">' + it.diagnosis + '</div></div>';
    });
    document.getElementById('urgent-list').innerHTML = uHtml;
  }
  renderRecList();
}

function setKpi(vId, dId, myV, avgV) {
  document.getElementById(vId).innerText = myV.toFixed(1) + '%';
  var diff = (myV - avgV).toFixed(1);
  var el = document.getElementById(dId);
  if (diff >= 0) {
    el.innerText = '+' + diff + '%p';
    el.className = 'diff plus';
  } else {
    el.innerText = diff + '%p';
    el.className = 'diff minus';
  }
}

function setRecFilter(mode, btn) {
  currentRecFilter = mode;
  document.querySelectorAll('#tab-rec .filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderRecList();
}

function renderRecList() {
  var cont = document.getElementById('daily-rec-container');
  var list = globalData.dailyRecs || [];
  var filtered = list.filter(function(d) {
    if (currentRecFilter === 'vacant') return String(d.myStatus).indexOf('공실') !== -1;
    if (currentRecFilter === 'weekend') return d.weekday === '금' || d.weekday === '토';
    return true;
  });

  var html = '';
  filtered.forEach(function(d) {
    var sCls = 'status-vacant';
    var myS = String(d.myStatus || '');
    if (myS.indexOf('마감') !== -1) sCls = 'status-closed';
    else if (myS.indexOf('예약') !== -1) sCls = 'status-booked';

    var sugg = (myS.indexOf('공실') !== -1 && d.suggestedPrice !== '-')
      ? '➔ ' + fmtPrice(d.suggestedPrice) : '';

    html += '<div class="daily-row">' +
      '<div class="date-col"><div class="date-main">' + String(d.date).substring(5) + ' <small>(' + d.weekday + ')</small></div><div class="date-sub">' + d.dDay + '</div></div>' +
      '<div class="status-badge ' + sCls + '">' + myS + '</div>' +
      '<div class="price-col"><div class="price-curr">' + fmtPrice(d.myPrice) + '</div><div class="price-sugg">' + sugg + '</div></div>' +
      '<div class="market-col">' + d.marketRate + '%</div></div>';
  });
  cont.innerHTML = html || '<div style="text-align:center;padding:20px;color:var(--text-sub);">내역이 없습니다.</div>';
}

// 3. 숙소 프로필 탭
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

    html += '<div id="' + cardId + '" class="' + cardCls + '" data-title="' + p.title + '">' +
      '<div class="p-header">' +
        '<a href="' + airbnbUrl + '" target="_blank" class="p-title-link">' +
          p.title + ' <span style="font-size:0.75rem; color:var(--accent);">↗</span>' +
        '</a>' +
        '<span class="' + badgeCls + '">' + badgeText + '</span>' +
      '</div>' +
      '<div class="p-specs">' +
        '<div>📍 ' + (p.address || '주소 정보 없음') + '</div>' +
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

// 4. 진단 리포트 탭
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


// ----------------------------------------------------
// 스프레드시트 메모(Note) 모바일 터치 & PC 마우스 오버 처리
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

  var rect = e.target.closest('.cell-box').getBoundingClientRect();
  var tipWidth = 230;
  
  // 화면 밖으로 나가지 않도록 좌우 위치 보정
  var left = rect.left + window.scrollX;
  if (left + tipWidth > window.innerWidth) {
    left = window.innerWidth - tipWidth - 16;
  }
  if (left < 10) left = 10;

  // 상단으로 띄우되, 화면 위로 벗어나면 셀 아래로 배치
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

// 이벤트 위임으로 셀 터치 및 마우스 이벤트 감지
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

// 모바일 탭 터치 지원
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
