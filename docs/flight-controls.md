# Flight Controls Specification

## Purpose
Describe how the player's plane is controlled using keyboard and mouse in 3D space.

## Input Mapping
- ArrowUp / ArrowDown: Pitch (nose up/down)
- ArrowLeft / ArrowRight: Yaw (turn left/right)
- W / S: Speed up / slow down
- A / D: Roll (rotate around forward axis)
- Mouse lock: Enable camera cursor control

## Motion
- Plane rotates using quaternions (pitch, yaw, roll)
- Forward movement along -Z of local transform
- Acceleration follows exponential damping

## Camera
- 3rd-person view, positioned behind and above the plane
- Smoothly follows plane position and orientation

## Notes
- Controls implemented in client/components/FlightScene.ts
- State update loop lives in main.ts
- Plane mesh: initially BoxGeometry, replace with GLTF model later
