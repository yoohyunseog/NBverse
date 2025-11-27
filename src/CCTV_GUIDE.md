# CCTV 감시 카메라 사이트 가이드

## CCTV에서 가져올 수 있는 데이터 유형

### 1. 실시간 비디오 스트림
- **RTSP (Real-Time Streaming Protocol)**
  - 가장 일반적인 CCTV 프로토콜
  - 예: `rtsp://username:password@ip:port/stream`
  - 웹 브라우저에서 직접 재생 불가 → 변환 필요 (WebRTC, HLS 등)

- **HTTP/HTTPS 스트림**
  - MJPEG 스트림: `http://ip:port/video`
  - HLS (HTTP Live Streaming): `.m3u8` 파일
  - 웹 브라우저에서 직접 재생 가능

- **WebRTC**
  - 실시간 저지연 스트리밍
  - P2P 연결로 서버 부하 감소
  - 최신 브라우저 지원

### 2. 정적 이미지 (스냅샷)
- **JPEG 스냅샷**
  - 예: `http://ip:port/snapshot.jpg`
  - 주기적으로 새로고침하여 실시간 효과
  - 간단하고 가벼움

### 3. 녹화된 비디오
- **녹화 파일 다운로드**
  - 특정 시간대의 녹화 영상
  - MP4, AVI 등 형식

### 4. 메타데이터
- 카메라 정보 (이름, 위치, 해상도)
- 타임스탬프
- 연결 상태
- 설정 정보

### 5. 이벤트 데이터
- 모션 감지 알림
- 경고/알람 이벤트
- 사용자 정의 이벤트

## 구현 가능한 방식

### 방식 1: MJPEG 스트림 (가장 간단)
```html
<img src="http://camera-ip/video" />
```
- 장점: 구현이 매우 간단, 브라우저 호환성 좋음
- 단점: 대역폭 사용량 높음, 지연 가능

### 방식 2: HLS 스트림
```html
<video src="http://camera-ip/stream.m3u8" controls></video>
```
- 장점: 적응형 비트레이트, 재생 제어 가능
- 단점: 약간의 지연 (10-30초)

### 방식 3: WebRTC (최신 방식)
- 실시간 저지연 스트리밍
- JavaScript로 구현 필요
- 가장 좋은 사용자 경험

### 방식 4: RTSP → 변환 서버
- 백엔드 서버에서 RTSP를 WebRTC/HLS로 변환
- 예: FFmpeg, MediaMTX, Janus Gateway 사용

## 카메라 타입별 접근 방법

### IP 카메라 (대부분의 현대 CCTV)
- RTSP URL 제공
- HTTP 스트림 제공
- 웹 인터페이스 내장

### DVR/NVR 시스템
- 여러 카메라를 하나의 시스템으로 관리
- 각 채널별 스트림 URL 제공
- 예: `rtsp://dvr-ip:554/channel1`

### 공공 CCTV
- 일부 도시/기관에서 공개 API 제공
- HTTP 스트림 또는 공개 URL

### 웹캠 (USB 카메라)
- 로컬 컴퓨터에서 직접 접근
- `getUserMedia()` API 사용
- 네트워크 스트리밍 서버 필요

## 보안 고려사항

1. **인증**
   - 기본 인증 (username:password)
   - 토큰 기반 인증
   - IP 화이트리스트

2. **암호화**
   - HTTPS 사용
   - RTSP over TLS

3. **접근 제어**
   - 사용자 권한 관리
   - 세션 관리

## 추천 구현 방식

### 초기 버전 (간단)
- MJPEG 스트림 또는 HTTP 스냅샷 사용
- 여러 카메라를 그리드로 표시
- 새로고침 간격 조절

### 고급 버전
- WebRTC 또는 HLS 사용
- 백엔드 서버로 RTSP 변환
- 녹화 기능 추가
- 모션 감지 알림

## 다음 단계

사이트를 만들 때 다음을 결정해야 합니다:
1. 어떤 카메라를 사용하나요? (IP 카메라, DVR, 웹캠 등)
2. 어떤 프로토콜을 지원하나요? (RTSP, HTTP, WebRTC)
3. 백엔드 서버가 필요한가요? (RTSP 변환용)
4. 보안 요구사항은 무엇인가요?

