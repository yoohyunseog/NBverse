const fs = require('fs');

const targetPath = 'novel_ai/v1.0.3/assets/js/attribute_data.js';
const hook = '        // 대화 상자에 챕터의 모든 속성과 데이터 추가';
const insertion = `        if ($dataInput) {
            $dataInput.value = "";
            $dataInput.style.height = "auto";
            localStorage.removeItem(STORAGE_KEY_DATA_TEXT);
            if ($dataBitInfo) {
                $dataBitInfo.textContent = "BIT: 계산 중...";
            }
        }

`;

const text = fs.readFileSync(targetPath, 'utf8');
if (!text.includes(hook)) {
    throw new Error('Hook not found in attribute_data.js');
}

const updated = text.replace(hook, insertion + hook);
fs.writeFileSync(targetPath, updated, 'utf8');
