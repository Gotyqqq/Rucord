import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Hero } from '../../data/heroList';

interface Props {
  hero: Hero;
}

export const GameScreen: React.FC<Props> = ({ hero }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameState = useRef<{
    units: any[];
    projectiles: any[];
    clock: THREE.Clock;
    targetPoint: THREE.Vector3 | null;
    heroSpeed: number;
    isMoving: boolean;
  }>({
    units: [],
    projectiles: [],
    clock: new THREE.Clock(),
    targetPoint: null,
    heroSpeed: 1100,
    isMoving: false,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Фокус на контейнер для получения событий клавиатуры
    container.focus();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0e11');
    scene.fog = new THREE.Fog(0x0b0e11, 500, 3000);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      1,
      10000,
    );
    // Камера как в Dota 2: не строго сверху, а под углом (изометрия)
    // Высота ~1000, смещение "назад" по Z ~700 — вид сверху-сбоку
    const cameraDist = 1100;
    const cameraTiltAngle = Math.PI * 0.22; // ~40° от вертикали
    const cameraY = cameraDist * Math.cos(cameraTiltAngle);
    const cameraZ = cameraDist * Math.sin(cameraTiltAngle);
    camera.position.set(0, cameraY, cameraZ);
    camera.lookAt(0, 0, 0);
    
    const cameraOffset = new THREE.Vector3(0, cameraY, cameraZ);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(500, 1000, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 5000;
    sun.shadow.camera.left = -2000;
    sun.shadow.camera.right = 2000;
    sun.shadow.camera.top = 2000;
    sun.shadow.camera.bottom = -2000;
    scene.add(sun);

    // Карта в стиле Dota 2: три линии, река по диагонали, Radiant (зелёный) / Dire (красноватый)
    const createDotaMap = () => {
      const mapSize = 2048;
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = mapSize;
      mapCanvas.height = mapSize;
      const ctx = mapCanvas.getContext('2d')!;

      // Radiant сторона (нижняя левая) — зелёная трава
      const radiantGrad = ctx.createLinearGradient(0, mapSize, mapSize, 0);
      radiantGrad.addColorStop(0, '#1e4d2a');
      radiantGrad.addColorStop(0.5, '#2a5a35');
      radiantGrad.addColorStop(1, '#1a3d22');
      ctx.fillStyle = radiantGrad;
      ctx.fillRect(0, 0, mapSize, mapSize);

      // Dire сторона (верхняя правая) — тёмная, красноватая
      const direGrad = ctx.createLinearGradient(0, 0, mapSize, mapSize);
      direGrad.addColorStop(0, '#2a1a1a');
      direGrad.addColorStop(0.5, '#3d2525');
      direGrad.addColorStop(1, '#251515');
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = direGrad;
      ctx.beginPath();
      ctx.moveTo(mapSize, 0);
      ctx.lineTo(mapSize, mapSize);
      ctx.lineTo(0, mapSize);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // Река по диагонали (как в Dota — разделяет Radiant и Dire)
      ctx.fillStyle = '#1a3a5a';
      ctx.beginPath();
      ctx.moveTo(0, mapSize);
      ctx.lineTo(mapSize * 0.35, mapSize * 0.65);
      ctx.lineTo(mapSize * 0.65, mapSize * 0.35);
      ctx.lineTo(mapSize, 0);
      ctx.lineTo(mapSize * 0.65, mapSize * 0.35);
      ctx.lineTo(mapSize * 0.35, mapSize * 0.65);
      ctx.closePath();
      ctx.fill();

      // Берега реки
      ctx.strokeStyle = '#3a4a3a';
      ctx.lineWidth = 50;
      ctx.beginPath();
      ctx.moveTo(0, mapSize);
      ctx.lineTo(mapSize * 0.35, mapSize * 0.65);
      ctx.lineTo(mapSize * 0.65, mapSize * 0.35);
      ctx.lineTo(mapSize, 0);
      ctx.stroke();

      // Три линии (лейны) — коричневые дорожки
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 70;
      // Верхняя линия
      ctx.beginPath();
      ctx.moveTo(0, mapSize * 0.25);
      ctx.lineTo(mapSize * 0.75, mapSize * 0.25);
      ctx.stroke();
      // Средняя линия (через центр)
      ctx.beginPath();
      ctx.moveTo(0, mapSize * 0.5);
      ctx.lineTo(mapSize, mapSize * 0.5);
      ctx.stroke();
      // Нижняя линия
      ctx.beginPath();
      ctx.moveTo(mapSize * 0.25, mapSize * 0.75);
      ctx.lineTo(mapSize, mapSize * 0.75);
      ctx.stroke();

      // Текстура травы
      ctx.fillStyle = 'rgba(60, 90, 60, 0.4)';
      for (let i = 0; i < 4000; i++) {
        const x = Math.random() * mapSize;
        const y = Math.random() * mapSize;
        ctx.fillRect(x, y, 2, 2);
      }

      // Камни/кусты
      ctx.fillStyle = '#2a2a2a';
      for (let i = 0; i < 150; i++) {
        const x = Math.random() * mapSize;
        const y = Math.random() * mapSize;
        const r = 6 + Math.random() * 12;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      return mapCanvas;
    };

    const mapCanvas = createDotaMap();
    const tex = new THREE.CanvasTexture(mapCanvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    
    const planeGeometry = new THREE.PlaneGeometry(6000, 6000);
    const planeMaterial = new THREE.MeshStandardMaterial({ 
      map: tex,
      roughness: 0.8,
      metalness: 0.1
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    plane.name = 'map';
    scene.add(plane);

    // Hero с улучшенной моделью
    const heroGroup = new THREE.Group();
    
    // Тело (цилиндр)
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 25, 60, 16),
      new THREE.MeshStandardMaterial({ 
        color: '#8b0000',
        roughness: 0.7,
        metalness: 0.3
      }),
    );
    body.castShadow = true;
    heroGroup.add(body);

    // Голова
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(30, 30, 30),
      new THREE.MeshStandardMaterial({ 
        color: '#d2b48c',
        roughness: 0.8
      }),
    );
    head.position.y = 50;
    head.castShadow = true;
    heroGroup.add(head);

    // Руки
    const leftArm = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 40, 8),
      new THREE.MeshStandardMaterial({ color: '#d2b48c' })
    );
    leftArm.position.set(-25, 20, 0);
    leftArm.rotation.z = 0.3;
    leftArm.castShadow = true;
    heroGroup.add(leftArm);

    const rightArm = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 40, 8),
      new THREE.MeshStandardMaterial({ color: '#d2b48c' })
    );
    rightArm.position.set(25, 20, 0);
    rightArm.rotation.z = -0.3;
    rightArm.castShadow = true;
    heroGroup.add(rightArm);

    // Ноги
    const leftLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 50, 8),
      new THREE.MeshStandardMaterial({ color: '#654321' })
    );
    leftLeg.position.set(-12, -40, 0);
    leftLeg.castShadow = true;
    heroGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 50, 8),
      new THREE.MeshStandardMaterial({ color: '#654321' })
    );
    rightLeg.position.set(12, -40, 0);
    rightLeg.castShadow = true;
    heroGroup.add(rightLeg);

    heroGroup.position.set(0, 30, 0);
    scene.add(heroGroup);

    // Сохраняем ссылки на части тела для анимации
    const bodyParts = { leftArm, rightArm, leftLeg, rightLeg };

    gameState.current.units.push({
      type: 'hero',
      mesh: heroGroup,
      team: 'radiant',
      hp: 1000,
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Управление только мышью; Q — способность (хук в сторону взгляда героя)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'q') return;
      e.preventDefault();
      if (e.repeat) return;
      
      // Направление взгляда героя (куда смотрит герой)
      const heroForward = new THREE.Vector3(0, 0, -1).applyQuaternion(heroGroup.quaternion);
      heroForward.y = 0;
      heroForward.normalize();
      
      if (hero.id === 'pudge') {
        // Хук летит в сторону, куда смотрит герой
        const hook = new THREE.Mesh(
          new THREE.ConeGeometry(10, 20, 8),
          new THREE.MeshStandardMaterial({ 
            color: '#666666',
            metalness: 0.8,
            roughness: 0.2
          }),
        );
        hook.position.copy(heroGroup.position);
        hook.position.y += 20;
        // Ориентируем конус (остриё) по направлению полёта
        if (heroForward.lengthSq() > 0.01) {
          hook.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(heroForward.x, 0, heroForward.z).normalize()
          );
        }
        scene.add(hook);

        const chainSegments: THREE.Mesh[] = [];
        const segmentCount = 15;
        for (let i = 0; i < segmentCount; i++) {
          const segment = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 2, 20, 6),
            new THREE.MeshStandardMaterial({ color: '#444444', metalness: 0.9, roughness: 0.1 }),
          );
          segment.position.copy(heroGroup.position);
          segment.position.y += 20;
          scene.add(segment);
          chainSegments.push(segment);
        }

        gameState.current.projectiles.push({
          type: 'hook',
          mesh: hook,
          chain: chainSegments,
          dir: heroForward.clone(),
          owner: heroGroup,
          maxDist: 800,
          traveled: 0,
          isReturning: false,
        });
      } else {
        const abilityMesh = new THREE.Mesh(
          new THREE.SphereGeometry(8, 8, 8),
          new THREE.MeshStandardMaterial({ color: '#ff6600' }),
        );
        abilityMesh.position.copy(heroGroup.position);
        abilityMesh.position.y += 20;
        scene.add(abilityMesh);
        gameState.current.projectiles.push({
          type: 'ability',
          mesh: abilityMesh,
          dir: heroForward.clone(),
          owner: heroGroup,
          maxDist: 800,
          traveled: 0,
        });
      }
    };
    
    document.addEventListener('keydown', onKeyDown);

    const onPointerMove = (e: PointerEvent) => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!container) return;
      
      // Фокус на контейнер для получения событий клавиатуры
      container.focus();
      
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(plane);
      if (intersects.length > 0) {
        const point = intersects[0].point.clone();
        point.y = 30;
        gameState.current.targetPoint = point;
      }
    };
    
    // Также добавляем клик на канвас для фокуса
    renderer.domElement.addEventListener('click', () => {
      container.focus();
    });
    
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerdown', onPointerDown);

    let animationTime = 0;

    const animate = () => {
      requestAnimationFrame(animate);
      let dt = gameState.current.clock.getDelta();
      dt = Math.min(dt, 0.1);
      animationTime += dt;
      const gs = gameState.current;

      // Только движение мышью (клик по карте)
      if (gs.targetPoint) {
        const diff = gs.targetPoint.clone().sub(heroGroup.position);
        diff.y = 0;
        const dist = diff.length();
        if (dist > 10) {
          gs.isMoving = true;
          diff.normalize();
          const moveDistance = Math.min(gs.heroSpeed * dt, dist);
          diff.multiplyScalar(moveDistance);
          heroGroup.position.add(diff);
          
          // Поворачиваем героя к цели
          heroGroup.lookAt(gs.targetPoint);
        } else {
          gs.targetPoint = null;
          gs.isMoving = false;
        }
      }

      // Анимация ходьбы
      if (gs.isMoving) {
        const walkSpeed = 8;
        const walkAmount = Math.sin(animationTime * walkSpeed) * 0.3;
        
        // Качание рук
        bodyParts.leftArm.rotation.x = walkAmount;
        bodyParts.rightArm.rotation.x = -walkAmount;
        
        // Качание ног
        bodyParts.leftLeg.rotation.x = -walkAmount * 0.5;
        bodyParts.rightLeg.rotation.x = walkAmount * 0.5;
        
        // Небольшое покачивание тела
        body.rotation.z = walkAmount * 0.1;
      } else {
        // Возвращаем в исходное положение
        bodyParts.leftArm.rotation.x = THREE.MathUtils.lerp(bodyParts.leftArm.rotation.x, 0.3, 0.1);
        bodyParts.rightArm.rotation.x = THREE.MathUtils.lerp(bodyParts.rightArm.rotation.x, -0.3, 0.1);
        bodyParts.leftLeg.rotation.x = THREE.MathUtils.lerp(bodyParts.leftLeg.rotation.x, 0, 0.1);
        bodyParts.rightLeg.rotation.x = THREE.MathUtils.lerp(bodyParts.rightLeg.rotation.x, 0, 0.1);
        body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, 0, 0.1);
      }
      
      // Камера следует за героем (изометрия как в Dota — не строго сверху)
      const targetCameraPos = heroGroup.position.clone().add(cameraOffset);
      camera.position.lerp(targetCameraPos, 0.08);
      camera.lookAt(heroGroup.position.x, heroGroup.position.y * 0.5, heroGroup.position.z);

      // Projectiles (хуки и способности)
      gs.projectiles = gs.projectiles.filter((p: any) => {
        if (p.type === 'hook') {
          // Обновляем хук
          if (!p.isReturning) {
            // Хук летит вперед
            const step = p.dir.clone().multiplyScalar(800 * dt);
            p.mesh.position.add(step);
            p.traveled += step.length();
            
            // Обновляем цепь
            const chainStart = p.owner.position.clone();
            chainStart.y += 20;
            const chainDir = p.mesh.position.clone().sub(chainStart).normalize();
            const segmentLength = 20;
            
            p.chain.forEach((segment: THREE.Mesh, i: number) => {
              const t = (i + 0.5) / p.chain.length;
              const pos = chainStart.clone().add(chainDir.clone().multiplyScalar(p.traveled * t));
              segment.position.copy(pos);
              segment.lookAt(pos.clone().add(chainDir));
            });
            
            if (p.traveled > p.maxDist) {
              p.isReturning = true;
            }
          } else {
            // Хук возвращается к герою (только XZ, как на карте)
            const ownerPos = p.owner.position;
            const hookPos = p.mesh.position;
            const returnDir = new THREE.Vector3(
              ownerPos.x - hookPos.x,
              0,
              ownerPos.z - hookPos.z
            ).normalize();
            const speed = 900 * dt;
            p.mesh.position.x += returnDir.x * speed;
            p.mesh.position.z += returnDir.z * speed;
            p.mesh.position.y = ownerPos.y + 20; // держим на высоте руки
            
            // Обновляем цепь при возврате
            const chainStart = p.owner.position.clone();
            chainStart.y += 20;
            const distToOwner = Math.hypot(
              p.mesh.position.x - chainStart.x,
              p.mesh.position.z - chainStart.z
            );
            const chainDir = new THREE.Vector3(
              p.mesh.position.x - chainStart.x,
              0,
              p.mesh.position.z - chainStart.z
            ).normalize();
            
            p.chain.forEach((segment: THREE.Mesh, i: number) => {
              const t = (i + 0.5) / p.chain.length;
              const segDist = distToOwner * t;
              segment.position.x = chainStart.x + chainDir.x * segDist;
              segment.position.z = chainStart.z + chainDir.z * segDist;
              segment.position.y = chainStart.y;
            });
            
            // Вернулся — полностью убираем хук и цепь со сцены (моделька не должна оставаться)
            const dist2D = Math.hypot(
              p.mesh.position.x - ownerPos.x,
              p.mesh.position.z - ownerPos.z
            );
            if (dist2D < 70) {
              const hookMesh = p.mesh;
              const chainArr = p.chain;
              scene.remove(hookMesh);
              if (hookMesh.geometry) hookMesh.geometry.dispose();
              const hookMat = (hookMesh as THREE.Mesh).material;
              if (hookMat) {
                if (Array.isArray(hookMat)) hookMat.forEach((m: THREE.Material) => m.dispose());
                else (hookMat as THREE.Material).dispose();
              }
              for (let i = 0; i < chainArr.length; i++) {
                const seg = chainArr[i];
                scene.remove(seg);
                if (seg.geometry) seg.geometry.dispose();
                if (seg.material) {
                  const m = seg.material as THREE.Material;
                  if (Array.isArray(m)) m.forEach((x: THREE.Material) => x.dispose());
                  else m.dispose();
                }
              }
              return false;
            }
          }
          return true;
        } else {
          // Обычные способности
          const step = p.dir.clone().multiplyScalar(600 * dt);
          p.mesh.position.add(step);
          p.traveled += step.length();
          if (p.traveled > p.maxDist) {
            scene.remove(p.mesh);
            return false;
          }
          return true;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerdown', onPointerDown);
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [hero]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <div 
        ref={mountRef} 
        className="absolute inset-0 w-full h-full outline-none" 
        tabIndex={0}
        onFocus={(e) => e.target.focus()}
      />
      <div
        className="absolute bottom-4 left-4 right-4 p-3 bg-black/60 text-white/90 text-sm rounded pointer-events-none select-none"
        style={{ fontFamily: 'Rajdhani, sans-serif' }}
      >
        <div className="font-semibold mb-1">Управление</div>
        <div>Клик по карте — движение · Q — хук (в сторону взгляда героя)</div>
      </div>
    </div>
  );
};
