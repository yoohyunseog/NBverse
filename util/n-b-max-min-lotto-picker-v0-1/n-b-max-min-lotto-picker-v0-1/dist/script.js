// ===============================
// 기본 변수
// ===============================
var floatingTextarea1 = $("#exampleFormControlTextarea1");
var floatingTextarea2 = $("#exampleFormControlTextarea2");
var floatingTextarea3 = $("#exampleFormControlTextarea3");
var floatingH1 = $("#h1");
var 스위치 = 0;
var 초기배열 = "1,2,3,4,5,26"; // 초기 예시값
var randCount = 0;
var 목표횟수 = 0;
var 결과배열 = []; // 모든 결과를 저장할 배열

floatingTextarea1.val(초기배열);

// ===============================
// 랜덤 생성 버튼
// ===============================
$("#randBtn").on("click", function () {
  randCount = 0;
  결과배열 = []; // 결과 배열 초기화
  목표횟수 = parseInt($("#randCount").val());
  if (isNaN(목표횟수) || 목표횟수 < 1) {
    alert("COUNT(시도 횟수)를 입력하세요.");
    return;
  }

  $("#h1").text("🎰 랜덤 추첨 시작 (" + 목표횟수 + "회 예정)");
  $("#topResultsContainer").html("<p class='text-center text-muted'>계산 중...</p>");
  스위치 = 1;
});

// ===============================
// 스위치 제어 루프
// ===============================
setInterval(function () {
  switch (스위치) {
    case 0:
      // 대기
      break;

    case 1:
      // STEP 1: 화이트볼 + 파워볼 랜덤 생성
      var whiteRange = Array.from({ length: 60 }, (_, i) => i + 1);
      var whiteBalls = [];
      for (var i = 0; i < 5; i++) {
        var randIndex = Math.floor(Math.random() * whiteRange.length);
        whiteBalls.push(whiteRange[randIndex]);
        whiteRange.splice(randIndex, 1);
      }
      whiteBalls.sort((a, b) => a - b);

      var powerBall = Math.floor(Math.random() * 26) + 1;
      var text = whiteBalls.join(",") + "," + powerBall;

      floatingTextarea1.val(text);
      floatingTextarea2.val(text);
      floatingTextarea3.val(text);

      floatingH1.text("STEP 1 완료 → " + text);
      스위치 = 2;
      break;

    case 2:
      // STEP 2: 포맷 정리
      var arr = floatingTextarea2.val().trim().split(",");
      var text = arr.map(x => x.trim()).join(",");
      floatingTextarea3.val(text);
      floatingH1.text("STEP 2 완료 → 포맷 정리");
      스위치 = 3;
      break;

    case 3:
      // STEP 3: BIT 계산
      var nb = floatingTextarea3.val().split(",").map(Number);
      var whiteBalls = nb.slice(0, 5);
      var powerBall = nb[5] || 0;

      var bit_max = Number(BIT_MAX_NB(whiteBalls));
      var bit_min = Number(BIT_MIN_NB(whiteBalls));

      const max = parseFloat(fix(bit_max));
      const min = parseFloat(fix(bit_min));
      var max_root = parseFloat(getPercentage(max, 10).toFixed(10));
      var min_root = parseFloat(getPercentage(min, 10).toFixed(10));
      var mm_root = parseFloat((max_root - min_root).toFixed(10));

      // ✅ 목표값 가져오기
      var 목표MAX = parseFloat($("#randMax").val()) || 0;
      var 목표MIN = parseFloat($("#randMin").val()) || 0;

      // ✅ 근사치 점수 계산 (목표값과의 거리)
      var maxDistance = parseFloat(Math.abs(max - 목표MAX).toFixed(10));
      var minDistance = parseFloat(Math.abs(min - 목표MIN).toFixed(10));
      var 총거리 = parseFloat((maxDistance + minDistance).toFixed(10)); // 거리가 작을수록 좋음

      // ✅ 결과 저장
      var 결과 = {
        whiteBalls: whiteBalls,
        powerBall: powerBall,
        max: max,
        min: min,
        mm_root: mm_root,
        거리: 총거리,
        maxDistance: maxDistance,
        minDistance: minDistance,
        numbers: whiteBalls.join(",") + "," + powerBall
      };
      결과배열.push(결과);

      // ✅ 결과 표시
      $("#NB-MAX").text(max.toFixed(10));
      $("#NB-MIN").text(min.toFixed(10));
      $("#NB-ROOT").text(mm_root.toFixed(10) + "%");
      $("#NB-VIEW").text(randCount + 1);

      $("#h1").text(
        "계산 완료 ✅ (" +
          (randCount + 1) +
          "회차 / 화이트볼: " +
          whiteBalls.join(",") +
          " / 파워볼: " +
          powerBall +
          ")"
      );

      // ✅ TOP 10 업데이트
      updateTopResults();

      // ✅ 조건 체크 후 반복 제어
      var maxValue = Math.max(...whiteBalls);
      var minValue = Math.min(...whiteBalls);

      if (
        (Number($("#randMax").val()) < max || isNaN(Number($("#randMax").val()))) &&
        (Number($("#randMin").val()) > min || isNaN(Number($("#randMin").val())))
      ) {
        // 조건 맞을 때만 다음 루프 진행
        randCount++;
      } else {
        // 조건 안 맞아도 반복 카운트 증가
        randCount++;
      }

      if (randCount < 목표횟수) {
        스위치 = 1; // 다음 반복 실행
      } else {
        스위치 = 0;
        $("#h1").text("✅ 모든 계산 완료 (" + randCount + "회 실행됨)");
        // 최종 TOP 10 업데이트
        updateTopResults();
      }
      break;
  }
}, 1);

// ===============================
// 공통 함수
// ===============================
const fix = (num) =>
  Number(num.toFixed(15).match(/\d+(?:\.\d+)?/)[0]).toFixed(10);

function getPercentage(value, maxValue) {
  if (maxValue === 0) return 0;
  return (value / maxValue) * 100;
}

// ===============================
// TOP 10 결과 업데이트 함수
// ===============================
function updateTopResults() {
  if (결과배열.length === 0) {
    $("#topResultsContainer").html("<p class='text-center text-muted'>결과가 없습니다.</p>");
    return;
  }

  // 거리 기준으로 정렬 (작을수록 좋음)
  var 정렬된결과 = 결과배열.slice().sort(function(a, b) {
    return a.거리 - b.거리;
  });

  // TOP 10만 선택
  var top10 = 정렬된결과.slice(0, 10);

  var html = "";
  top10.forEach(function(결과, index) {
    var rank = index + 1;
    var rankClass = "";
    if (rank === 1) rankClass = "rank-1";
    else if (rank === 2) rankClass = "rank-2";
    else if (rank === 3) rankClass = "rank-3";

    html += '<div class="result-item ' + rankClass + '">';
    html += '<div class="d-flex align-items-center mb-2">';
    html += '<span class="rank-badge">' + rank + '</span>';
    html += '<div class="numbers-display">' + 결과.numbers + '</div>';
    html += '</div>';
    html += '<div class="stats-grid">';
    html += '<div class="stat-item"><strong>MAX:</strong> ' + 결과.max.toFixed(10) + '</div>';
    html += '<div class="stat-item"><strong>MIN:</strong> ' + 결과.min.toFixed(10) + '</div>';
    html += '<div class="stat-item"><strong>ROOT:</strong> ' + 결과.mm_root.toFixed(10) + '%</div>';
    html += '<div class="stat-item"><strong>거리:</strong> ' + 결과.거리.toFixed(10) + '</div>';
    html += '</div>';
    html += '</div>';
  });

  $("#topResultsContainer").html(html);
}