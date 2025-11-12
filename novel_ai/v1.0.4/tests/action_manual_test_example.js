(() => {
  'use strict';

  const BASE_URL = window.CONFIG?.BASE_URL || 'http://127.0.0.1:8123';
  const { calculateBitValues } = window.NovelAIShared || {};

  // 사이드바 너비 관리
  const STORAGE_KEY = 'exampleSidebarWidth';
  const DEFAULT_WIDTH = 280;
  let sidebarWidth = parseInt(localStorage.getItem(STORAGE_KEY)) || DEFAULT_WIDTH;

  function applySidebarWidth(width) {
    const sidebar = document.getElementById('exampleSidebar');
    const resizer = document.getElementById('exampleResizer');
    const container = document.querySelector('.example-container');
    
    if (sidebar && resizer && container) {
      sidebar.style.width = `${width}px`;
      resizer.style.left = `${width}px`;
      container.style.marginLeft = `${width + 4}px`;
      container.style.width = `calc(100% - ${width + 4}px)`;
      sidebarWidth = width;
      localStorage.setItem(STORAGE_KEY, width.toString());
    }
  }

  // 리사이저 초기화
  function initResizer() {
    const resizer = document.getElementById('exampleResizer');
    const sidebar = document.getElementById('exampleSidebar');
    if (!resizer || !sidebar) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = sidebarWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const diff = e.clientX - startX;
      const newWidth = Math.max(200, Math.min(window.innerWidth * 0.5, startWidth + diff));
      applySidebarWidth(newWidth);
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // 모바일 토글
  function initMobileToggle() {
    const toggleBtn = document.getElementById('exampleToggleBtn');
    const sidebar = document.getElementById('exampleSidebar');
    const overlay = document.getElementById('exampleOverlay');
    
    if (!toggleBtn || !sidebar || !overlay) return;

    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // 목차 생성
  function generateTOC() {
    const toc = document.getElementById('exampleToc');
    if (!toc) return;

    const sections = document.querySelectorAll('.example-section[id^="section-"]');
    sections.forEach(section => {
      const h2 = section.querySelector('h2');
      if (!h2) return;

      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${section.id}`;
      a.textContent = h2.textContent.trim();
      a.addEventListener('click', (e) => {
        e.preventDefault();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(a);
      toc.appendChild(li);
    });
  }

  // BIT 계산 및 표시
  function updateBitDisplay(attributeText, bitMaxId, bitMinId) {
    if (!calculateBitValues || !attributeText) return;
    const bits = calculateBitValues(attributeText);
    const maxEl = document.getElementById(bitMaxId);
    const minEl = document.getElementById(bitMinId);
    if (maxEl) maxEl.value = bits.max;
    if (minEl) minEl.value = bits.min;
  }

  // Debounce 함수
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // 자동 실행 설정
  document.addEventListener('DOMContentLoaded', () => {
    // 1. 데이터 저장 - 자동 실행
    const saveAttrInput = document.getElementById('saveAttributeText');
    const saveDataInput = document.getElementById('saveDataText');
    const saveNovelInput = document.getElementById('saveNovelTitle');
    
    // 소설 제목 입력 시 속성 경로 자동 구성
    if (saveNovelInput && saveAttrInput) {
      saveNovelInput.addEventListener('input', () => {
        const novelTitle = saveNovelInput.value.trim();
        if (novelTitle && !saveAttrInput.value.trim()) {
          // 속성 경로가 비어있으면 소설 제목으로 시작하는 경로 제안
          saveAttrInput.placeholder = `${novelTitle} → 챕터 1: 제1장 → 구성`;
        }
      });
    }
    
    const autoSave = debounce(() => {
      const attrText = saveAttrInput?.value?.trim();
      const dataText = saveDataInput?.value?.trim();
      if (attrText && dataText) {
        testSave();
      }
    }, 800);

    if (saveAttrInput) {
      saveAttrInput.addEventListener('input', autoSave);
    }
    if (saveDataInput) {
      saveDataInput.addEventListener('input', autoSave);
    }
    if (saveNovelInput) {
      saveNovelInput.addEventListener('input', autoSave);
    }

    // 2-1. 속성 입력으로 조회 - 자동 실행
    const queryAttrInput = document.getElementById('queryAttributeText');
    const queryNovelInput = document.getElementById('queryNovelTitle');
    const queryBitMaxInput = document.getElementById('queryBitMax');
    const queryBitMinInput = document.getElementById('queryBitMin');
    const querySimilarityInput = document.getElementById('querySimilarity');
    const queryThresholdInput = document.getElementById('queryThreshold');
    const queryLimitInput = document.getElementById('queryLimit');

    // 소설 제목 입력 시 속성 경로 자동 구성
    if (queryNovelInput && queryAttrInput) {
      queryNovelInput.addEventListener('input', () => {
        const novelTitle = queryNovelInput.value.trim();
        if (novelTitle && !queryAttrInput.value.trim()) {
          // 속성 경로가 비어있으면 소설 제목으로 시작하는 경로 제안
          queryAttrInput.placeholder = `${novelTitle} → 챕터 1: 제1장 → 구성`;
        }
      });
    }

    const autoQuery = debounce(() => {
      const attrText = queryAttrInput?.value?.trim();
      const bitMax = queryBitMaxInput?.value;
      const bitMin = queryBitMinInput?.value;
      if (attrText || (bitMax && bitMin)) {
        testQueryAttribute();
      }
    }, 800);

    if (queryAttrInput) {
      queryAttrInput.addEventListener('input', () => {
        if (calculateBitValues && queryAttrInput.value) {
          updateBitDisplay(queryAttrInput.value, 'queryBitMax', 'queryBitMin');
        }
        autoQuery();
      });
    }
    if (queryNovelInput) queryNovelInput.addEventListener('input', autoQuery);
    if (queryBitMaxInput) queryBitMaxInput.addEventListener('input', autoQuery);
    if (queryBitMinInput) queryBitMinInput.addEventListener('input', autoQuery);
    if (querySimilarityInput) querySimilarityInput.addEventListener('change', autoQuery);
    if (queryThresholdInput) queryThresholdInput.addEventListener('input', autoQuery);
    if (queryLimitInput) queryLimitInput.addEventListener('input', autoQuery);

    // 2. 전체 데이터 조회 - 자동 실행
    const queryAllNovelInput = document.getElementById('queryAllNovelTitle');
    const queryAllLimitInput = document.getElementById('queryAllLimit');

    const autoQueryAll = debounce(() => {
      testQueryAll();
    }, 800);

    if (queryAllNovelInput) queryAllNovelInput.addEventListener('input', autoQueryAll);
    if (queryAllLimitInput) queryAllLimitInput.addEventListener('input', autoQueryAll);

    // 3. 폴더 구조 조회 - 자동 실행
    const foldersIncludeFilesInput = document.getElementById('foldersIncludeFiles');

    const autoFolders = debounce(() => {
      testFolders();
    }, 500);

    if (foldersIncludeFilesInput) {
      foldersIncludeFilesInput.addEventListener('change', autoFolders);
    }

    // 초기 로드 시 자동 실행
    setTimeout(() => {
      // 폴더 조회 실행
      if (foldersIncludeFilesInput) {
        testFolders();
      }
      // 전체 데이터 조회 실행
      testQueryAll();
    }, 500);
  });

  // 1. 데이터 저장
  window.testSave = async function(retryWithExpectedBits = false) {
    const attributeText = document.getElementById('saveAttributeText')?.value?.trim();
    const dataText = document.getElementById('saveDataText')?.value?.trim();
    const novelTitle = document.getElementById('saveNovelTitle')?.value?.trim();

    if (!attributeText || !dataText) {
      alert('속성 경로와 데이터 본문을 입력하세요.');
      return;
    }

    let bits;
    if (retryWithExpectedBits && window.lastExpectedBits) {
      // 서버가 제공한 올바른 BIT 값 사용
      bits = window.lastExpectedBits;
    } else {
      // 클라이언트에서 계산한 BIT 값 사용
      bits = calculateBitValues ? calculateBitValues(attributeText) : { max: 0, min: 0 };
    }
    
    const payload = {
      attributeText,
      attributeBitMax: bits.max,
      attributeBitMin: bits.min,
      text: dataText
    };
    if (novelTitle) payload.novelTitle = novelTitle;

    const resultBox = document.getElementById('saveResult');
    const statusEl = document.getElementById('saveStatus');
    const responseEl = document.getElementById('saveResponse');
    const curlBox = document.getElementById('saveCurl');
    const curlText = document.getElementById('saveCurlText');

    statusEl.textContent = '요청 중...';
    statusEl.className = 'status loading';
    responseEl.textContent = '';

    try {
      const response = await fetch(`${BASE_URL}/api/attributes/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      // BIT 값 불일치 오류인 경우, 서버가 제공한 올바른 BIT 값으로 자동 재시도
      if (!data.ok && data.error === 'attributeBit values do not match attributeText' && data.expected && !retryWithExpectedBits) {
        window.lastExpectedBits = data.expected;
        // 자동으로 올바른 BIT 값으로 재시도
        return testSave(true);
      }
      
      responseEl.textContent = JSON.stringify(data, null, 2);
      
      if (data.ok) {
        statusEl.textContent = '성공';
        statusEl.className = 'status success';
        // 성공 시 lastExpectedBits 초기화
        window.lastExpectedBits = null;
      } else {
        statusEl.textContent = '실패';
        statusEl.className = 'status error';
      }

      // curl 명령어 생성 (최종 사용된 payload 사용)
      const curlCmd = `curl -X POST ${BASE_URL}/api/attributes/data \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload)}'`;
      curlText.textContent = curlCmd;
      curlBox.style.display = 'block';
    } catch (error) {
      statusEl.textContent = '오류';
      statusEl.className = 'status error';
      responseEl.textContent = `오류 발생: ${error.message}`;
    }
  };


  // 2-1. 속성 입력으로 조회
  window.testQueryAttribute = async function() {
    const attributeText = document.getElementById('queryAttributeText')?.value?.trim();
    const novelTitle = document.getElementById('queryNovelTitle')?.value?.trim();
    const bitMax = document.getElementById('queryBitMax')?.value;
    const bitMin = document.getElementById('queryBitMin')?.value;
    const similarity = document.getElementById('querySimilarity')?.checked;
    const threshold = document.getElementById('queryThreshold')?.value || '0.1';
    const limit = document.getElementById('queryLimit')?.value || '100';

    let finalBitMax = bitMax;
    let finalBitMin = bitMin;

    if (attributeText && calculateBitValues) {
      const bits = calculateBitValues(attributeText);
      finalBitMax = bits.max;
      finalBitMin = bits.min;
      document.getElementById('queryBitMax').value = bits.max;
      document.getElementById('queryBitMin').value = bits.min;
    }

    if (!finalBitMax || !finalBitMin) {
      alert('속성 경로를 입력하거나 BIT 값을 입력하세요.');
      return;
    }

    const params = new URLSearchParams({
      bitMax: finalBitMax,
      bitMin: finalBitMin,
      limit
    });
    if (similarity) {
      params.append('similarity', 'true');
      params.append('threshold', threshold);
    }

    const resultBox = document.getElementById('queryResult');
    const statusEl = document.getElementById('queryStatus');
    const responseEl = document.getElementById('queryResponse');
    const curlBox = document.getElementById('queryCurl');
    const curlText = document.getElementById('queryCurlText');

    statusEl.textContent = '요청 중...';
    statusEl.className = 'status loading';
    responseEl.textContent = '';

    try {
      const response = await fetch(`${BASE_URL}/api/attributes/data?${params}`);
      const data = await response.json();
      
      // 소설 제목 필터 적용
      if (data.ok && data.items && novelTitle) {
        data.items = data.items.filter(item => {
          const itemNovelTitle = item.novel?.title || '';
          const itemAttributeText = item.attribute?.text || '';
          // 소설 제목이 속성 경로의 시작 부분에 포함되어 있는지 확인
          return itemNovelTitle === novelTitle || itemAttributeText.startsWith(novelTitle + ' →');
        });
        data.count = data.items.length;
      }
      
      responseEl.textContent = JSON.stringify(data, null, 2);
      
      if (data.ok) {
        statusEl.textContent = novelTitle ? `성공 (소설 제목 필터: ${novelTitle})` : '성공';
        statusEl.className = 'status success';
      } else {
        statusEl.textContent = '실패';
        statusEl.className = 'status error';
      }

      const curlCmd = `curl "${BASE_URL}/api/attributes/data?${params}"`;
      curlText.textContent = curlCmd;
      curlBox.style.display = 'block';
    } catch (error) {
      statusEl.textContent = '오류';
      statusEl.className = 'status error';
      responseEl.textContent = `오류 발생: ${error.message}`;
    }
  };


  // 2. 전체 데이터 조회
  window.testQueryAll = async function() {
    const novelTitle = document.getElementById('queryAllNovelTitle')?.value?.trim();
    const limit = document.getElementById('queryAllLimit')?.value || '50';

    const params = new URLSearchParams({ limit });
    if (novelTitle) params.append('novelTitle', novelTitle);

    const resultBox = document.getElementById('queryAllResult');
    const statusEl = document.getElementById('queryAllStatus');
    const responseEl = document.getElementById('queryAllResponse');
    const curlBox = document.getElementById('queryAllCurl');
    const curlText = document.getElementById('queryAllCurlText');

    statusEl.textContent = '요청 중...';
    statusEl.className = 'status loading';
    responseEl.textContent = '';

    try {
      const response = await fetch(`${BASE_URL}/api/tests/records?${params}`);
      const data = await response.json();
      responseEl.textContent = JSON.stringify(data, null, 2);
      
      if (data.ok) {
        statusEl.textContent = '성공';
        statusEl.className = 'status success';
      } else {
        statusEl.textContent = '실패';
        statusEl.className = 'status error';
      }

      const curlCmd = `curl "${BASE_URL}/api/tests/records?${params}"`;
      curlText.textContent = curlCmd;
      curlBox.style.display = 'block';
    } catch (error) {
      statusEl.textContent = '오류';
      statusEl.className = 'status error';
      responseEl.textContent = `오류 발생: ${error.message}`;
    }
  };


  // 4. 폴더 구조 조회
  window.testFolders = async function() {
    const includeFiles = document.getElementById('foldersIncludeFiles')?.checked;
    const params = new URLSearchParams();
    if (includeFiles) params.append('includeFiles', 'true');

    const resultBox = document.getElementById('foldersResult');
    const statusEl = document.getElementById('foldersStatus');
    const responseEl = document.getElementById('foldersResponse');
    const curlBox = document.getElementById('foldersCurl');
    const curlText = document.getElementById('foldersCurlText');

    statusEl.textContent = '요청 중...';
    statusEl.className = 'status loading';
    responseEl.textContent = '';

    try {
      const url = params.toString() ? `${BASE_URL}/api/tests/folders?${params}` : `${BASE_URL}/api/tests/folders`;
      const response = await fetch(url);
      const data = await response.json();
      responseEl.textContent = JSON.stringify(data, null, 2);
      
      if (data.ok) {
        statusEl.textContent = '성공';
        statusEl.className = 'status success';
      } else {
        statusEl.textContent = '실패';
        statusEl.className = 'status error';
      }

      const curlCmd = `curl "${url}"`;
      curlText.textContent = curlCmd;
      curlBox.style.display = 'block';
    } catch (error) {
      statusEl.textContent = '오류';
      statusEl.className = 'status error';
      responseEl.textContent = `오류 발생: ${error.message}`;
    }
  };

  // curl 복사
  window.copyCurl = function(id) {
    const text = document.getElementById(id)?.textContent;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        alert('curl 명령어가 클립보드에 복사되었습니다.');
      }).catch(() => {
        alert('복사에 실패했습니다.');
      });
    }
  };

  // 현재 페이지 감지
  function setActiveNavItem() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.example-sidebar-nav a');
    navLinks.forEach(link => {
      link.classList.remove('active');
      const href = link.getAttribute('href');
      if (currentPath.endsWith(href)) {
        link.classList.add('active');
      }
    });
  }

  // 초기화
  document.addEventListener('DOMContentLoaded', () => {
    setActiveNavItem();
    applySidebarWidth(sidebarWidth);
    initResizer();
    initMobileToggle();
    generateTOC();

    window.addEventListener('resize', () => {
      const maxWidth = window.innerWidth <= 991.98 ? window.innerWidth * 0.8 : window.innerWidth * 0.5;
      if (sidebarWidth > maxWidth) {
        applySidebarWidth(Math.min(sidebarWidth, maxWidth));
      }
    });
  });
})();

