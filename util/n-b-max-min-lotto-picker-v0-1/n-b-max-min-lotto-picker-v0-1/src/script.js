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

floatingTextarea1.val(초기배열);

// ===============================
// 랜덤 생성 버튼
// ===============================
$("#randBtn").on("click", function () {
  randCount = 0;
  목표횟수 = parseInt($("#randCount").val());
  if (isNaN(목표횟수) || 목표횟수 < 1) {
    alert("COUNT(시도 횟수)를 입력하세요.");
    return;
  }

  $("#h1").text("🎰 랜덤 추첨 시작 (" + 목표횟수 + "회 예정)");
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

      const max = fix(bit_max);
      const min = fix(bit_min);
      var max_root = getPercentage(max, 10);
      var min_root = getPercentage(min, 10);
      var mm_root = max_root - min_root;

      // ✅ 결과 표시
      $("#NB-MAX").text("MAX " + max);
      $("#NB-MIN").text("MIN " + min);
      $("#NB-ROOT").text("ROOT " + mm_root.toFixed(2) + "%");
      $("#NB-VIEW").text("COUNT " + (randCount + 1) + " HIT");

      $("#h1").text(
        "계산 완료 ✅ (" +
          (randCount + 1) +
          "회차 / 화이트볼: " +
          whiteBalls.join(",") +
          " / 파워볼: " +
          powerBall +
          ")"
      );

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
      }
      break;
  }
}, 1);

// ===============================
// 공통 함수
// ===============================
const fix = (num) =>
  Number(num.toFixed(8).match(/\d+(?:\.\d+)?/)[0]).toFixed(7);

function getPercentage(value, maxValue) {
  if (maxValue === 0) return 0;
  return (value / maxValue) * 100;
}
