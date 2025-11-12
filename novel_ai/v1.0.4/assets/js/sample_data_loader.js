(() => {
  const Shared = window.NovelAIShared;
  document.addEventListener('DOMContentLoaded', () => {
    const sampleBtn = document.getElementById('loadSampleDataBtn');
    if (!sampleBtn) return;

    if (!Shared) {
      sampleBtn.disabled = true;
      sampleBtn.title = 'novel_ai_shared.js 로드 오류';
      return;
    }

    sampleBtn.addEventListener('click', async () => {
      const baseUrl = typeof window.getServerUrl === 'function'
        ? window.getServerUrl('')
        : (window.location.origin || '').replace(/\/$/, '');

      if (!baseUrl) {
        window.addRightLog?.('warn', '[샘플 데이터] 서버 URL을 확인할 수 없습니다.');
        return;
      }

      if (!confirm('현재 저장된 데이터를 초기화하고 샘플 데이터를 불러올까요?')) {
        return;
      }

      sampleBtn.disabled = true;
      const originalText = sampleBtn.textContent;
      sampleBtn.textContent = '로딩 중...';

      try {
        await Shared.resetTestData(baseUrl);

        const novelTitle = Shared.pickDefaultNovelTitle();
        const chapterCount = 3;
        const chapters = Shared.buildSampleChapters(novelTitle, chapterCount, [], '');
        const payload = {
          novelTitle,
          chapters: chapters.map(chapter => ({
            label: `챕터 ${chapter.number}: ${chapter.title}`,
            info: {
              number: String(chapter.number),
              title: chapter.title,
              description: chapter.scene
            },
            sections: chapter.sections.map(section => ({
              name: section.name,
              text: section.text
            }))
          }))
        };

        const sampleUrl = typeof window.getServerUrl === 'function'
          ? window.getServerUrl('/api/tests/sample-data')
          : `${baseUrl}/api/tests/sample-data`;
        const response = await fetch(sampleUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.ok) {
          throw new Error(json?.error || `HTTP ${response.status}`);
        }

        const filterInput = document.getElementById('attributeFilterInput');
        if (filterInput) {
          filterInput.value = novelTitle;
        }
        const novelInput = document.getElementById('novelTitleInput');
        if (novelInput) {
          novelInput.value = novelTitle;
        }
        const novelChapterInput = document.getElementById('novelTitleInputForChapter');
        if (novelChapterInput) {
          novelChapterInput.value = novelTitle;
        }

        window.addRightLog?.('info', `[샘플 데이터] '${novelTitle}' 샘플이 로드되었습니다.`);
        window.updateSaveStatus?.('샘플 데이터 로드 완료!', 'success');

        if (typeof window.loadAttributes === 'function') {
          await window.loadAttributes();
        }

        window.addRightLog?.('info', `[샘플 데이터] 챕터 ${chapterCount}개, 총 ${json.processed || 0}개 레코드 생성`);
      } catch (error) {
        console.error('[샘플 데이터] 오류', error);
        window.addRightLog?.('error', `[샘플 데이터] 실패: ${error.message || error}`);
        alert(`샘플 데이터 로드 중 오류가 발생했습니다: ${error.message || error}`);
      } finally {
        sampleBtn.disabled = false;
        sampleBtn.textContent = originalText;
      }
    });
  });
})();
