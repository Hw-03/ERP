---
type: folder-note
source_path: "docker"
importance: important
layer: docker
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 docker

## 이 폴더는 무엇을 위한 곳인가

컨테이너로 서버를 실행하기 위한 설정입니다.

## 현장 업무와의 관계

NAS나 서버 환경에서 같은 실행 환경을 맞출 때 사용합니다.

## 언제 보면 좋나

- 로컬 실행이 아니라 서버/컨테이너 실행을 준비할 때

## 먼저 볼 파일 5개

- [[ERP/docker/docker-compose.nas.yml]] — `docker-compose.nas.yml`는 YAML 설정입니다. 프로젝트 구조 안에서 `docker/docker-compose.nas.yml` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/docker/docker-compose.yml]] — `docker-compose.yml`는 YAML 설정입니다. 프로젝트 구조 안에서 `docker/docker-compose.yml` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 어떻게 읽으면 되나

로컬 PC에서 단순히 데모를 띄울 때는 보통 루트의 [[ERP/start.bat]]가 먼저입니다. `docker/`는 같은 서버 구성을 NAS나 별도 서버에서 반복 실행해야 할 때 확인합니다.

`docker-compose.yml`은 기본 컨테이너 구성을, `docker-compose.nas.yml`은 NAS 배포처럼 별도 환경을 의식한 구성을 담습니다. 둘 다 포트와 볼륨, DB 파일 위치가 핵심입니다.

## 확인할 항목

- 백엔드와 프론트가 어떤 포트로 열리는지
- DB 파일이나 백업 폴더가 컨테이너 안팎 어디에 연결되는지
- 환경 변수가 로컬 실행과 다르게 잡히는지
- NAS/서버에서 재시작해도 데이터가 유지되는지

## 조심할 점

포트, 볼륨, DB 위치 설정을 잘못 바꾸면 운영 데이터 위치가 달라질 수 있습니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/📁_ERP]]
