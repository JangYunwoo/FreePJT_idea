# CharacterGen 로컬 환경 상태

이 폴더는 [CharacterGen 공식 코드](https://github.com/zjp-shadow/CharacterGen) `f329a83`을 기반으로 구성했다.

## 현재 완료

- `venv/`: Python 3.9.25 가상환경 (다른 프로젝트와 분리)
- PyTorch 2.4.0 + CUDA 12.1, torchvision 0.19.0, xformers 0.0.27.post2 설치
- 2D/3D 단계의 일반 Python 패키지 설치. Python 3.9와 맞추기 위해 Gradio 4.44.1 사용
- NumPy 1.26.4, OpenCV 4.10.0.84로 고정
- RTX 4050 CUDA 인식, 2D 모듈 import, 전체 소스 문법 검사, 패키지 의존성 검사 통과
- `CharacterGen_test.ipynb` 생성 및 `Python (CharacterGen)` Jupyter 커널 등록. 노트북의 환경/이미지 셀 실행 검증 완료
- 노트북에서 2D 단계만 사용할 수 있도록 `webui.py`의 가중치 다운로드와 선택적 `refine` import를 실행 시점으로 이동

## 현재 테스트 진행 상황

- CharacterGen의 2D 체크포인트와 이미지 인코더 가중치는 다운로드되어 있다. 이 파일들과 `venv/`는 Git에 포함하지 않는다.
- 원래 설정의 `stabilityai/stable-diffusion-2-1` 주소가 404 오류를 반환해, `2D_Stage/configs/infer.yaml`을 별도 [SD 2.1 커뮤니티 미러](https://huggingface.co/sd2-community/stable-diffusion-2-1)로 변경했다. 이 미러는 Stability AI 공식 저장소가 아니다. 추가 가중치 다운로드와 실제 추론 성공 여부는 아직 확인되지 않았다.
- 2D 추론은 40단계 중 첫 단계까지 진행했으나 실행 시간이 길어 사용자가 중단했다. 따라서 생성된 4방향 PNG의 품질과 완료 여부는 아직 검증되지 않았다.

## 아직 실행 불가 또는 미검증

- 3D 단계 필수 패키지 `nvdiffrast` 설치 실패: `CUDA_HOME environment variable is not set`. 이 PC에는 CUDA Toolkit과 Visual Studio C++ Build Tools가 확인되지 않았다. CUDA 지원 PyTorch 설치와 CUDA Toolkit 설치는 별개다.
- RTX 4050 Laptop GPU 6 GB VRAM에서 2D/3D 전체 추론이 가능한지는 아직 검증되지 않았다.

따라서 현재 상태를 **추론 완료된 CharacterGen 환경으로 간주하면 안 된다**. 현재 목표인 4방향 PNG만 시험한다면 노트북의 `2. 4방향 이미지 생성` 아래 저장 셀까지만 실행하고, `3. 3D 메시 생성`부터는 실행하지 않는다. 3D 메시나 리깅이 필요해질 때에만 별도 환경과 [UniRig](https://github.com/VAST-AI-Research/UniRig) 연계를 검토한다.

## 확인 명령 (PowerShell)

```powershell
.\venv\Scripts\python.exe --version
.\venv\Scripts\python.exe -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

노트북 사용: VS Code에서 CharacterGen 폴더를 작업 폴더로 열고 `CharacterGen_test.ipynb`의 `Python (CharacterGen)` 커널을 선택한다. 노트북은 현재 작업 폴더(`Path.cwd()`)를 프로젝트 루트로 사용하므로 PC별 절대경로 수정은 필요 없다. 입력 이미지는 `test_inputs/`에 넣고 입력 셀의 `INPUT_PNG` 파일명을 바꾼다. `test_inputs/` 안의 로컬 PNG는 Git에 포함되지 않으므로 clone 후 별도로 넣어야 한다. 2D 결과는 `mv_res/notebook_test/<입력 파일명>/`에 저장된다. 수 GB 다운로드와 6GB VRAM 제약을 확인하고 진행해야 한다.
