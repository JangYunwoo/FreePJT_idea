# 3D 실험용

2D 캐릭터 이미지 한 장을 입력해 측면·후면 뷰를 생성하고, 이후 3D 모델 제작 가능성을 검토하기 위한 실험 폴더입니다.

## Era3D

`Era3D/`에는 [공식 GitHub 저장소](https://github.com/pengHTYX/Era3D)의 소스 코드 스냅샷을 가져왔습니다. 기준 커밋은 `a2ce68da53c0dc4df403112c53692b9ba893a4f0`입니다. 원본 라이선스 파일 `Era3D/LICENCE`를 보존했습니다. 모델 가중치는 [Hugging Face](https://huggingface.co/pengHTYX/MacLab-Era3D-512-6view)에 별도로 공개되어 있습니다.

우선 목표는 3D 메시 생성이 아니라 입력 이미지에서 측면·후면 컬러 이미지를 생성해 일관성을 비교하는 것입니다. `Era3D/requirements.txt`는 3D 재구성·학습용 패키지까지 포함하므로, Windows에서 이미지 추론만 시험할 때는 별도의 `Era3D/requirements-inference-windows.txt`를 사용합니다.

### 이 PC의 설치·검증 상태

- `Era3D/venv`: Python 3.9.25 가상환경. PyTorch 2.1.2+cu118, torchvision 0.16.2+cu118, xformers 0.0.23.post1+cu118과 이미지 추론용 의존성을 설치했습니다.
- `Era3D/MacLab-Era3D-512-6view`: 공식 모델 가중치를 내려받았습니다.
- RTX 4050 Laptop GPU(6GB)에서 공식 예제 이미지 `3968940-PH.png` 한 장으로 512×512, 6방향, 10단계 추론이 완료되었습니다. 약 3분 35초가 걸렸으며 결과는 `Era3D/mv_res/local_smoke/3968940-PH/`에 있습니다.
- 위 결과는 **환경 동작 확인**입니다. 사용자가 제공한 `111.jpg`의 왼쪽 캐릭터를 입력해 측면·후면 품질을 평가한 결과는 아직 아닙니다.

프로젝트의 `Era3D` 폴더에서 다음 명령으로 같은 검증을 다시 실행할 수 있습니다.

```powershell
.\venv\Scripts\python.exe test_mvdiffusion_unclip.py --config configs/test_unclip-512-6view.yaml pretrained_model_name_or_path=./MacLab-Era3D-512-6view validation_dataset.num_validation_samples=1 dataloader_num_workers=0 pipe_validation_kwargs.num_inference_steps=10 save_mode=rgb save_dir=mv_res/local_smoke
```

`color_right_masked.png`, `color_back_masked.png` 등이 결과 이미지입니다. `venv/`, 모델 가중치, `mv_res/`는 Git에서 제외됩니다. 실제 서비스를 공개하거나 재배포하기 전에는 원본 GitHub 코드의 AGPL-3.0 조건과 모델 저장소의 별도 라이선스 표기를 함께 확인해야 합니다.
