from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


REPO_ROOT = Path(__file__).resolve().parents[3]
ROBOT_PATH = REPO_ROOT / "apps" / "landrush" / "public" / "navigation" / "proto_pascal_robot.glb"
TARGET_ROBOT_HEIGHT = 1.82
DESIGN_ORDER = ("scout", "sentinel", "breacher")
DESIGN_LABELS = {
    "scout": ("SCOUT GIMBAL", "232 tris / pair"),
    "sentinel": ("SENTINEL MK II", "264 tris / pair  -  SELECTED"),
    "breacher": ("BREACHER BAR", "184 tris / pair"),
}


def parse_args() -> argparse.Namespace:
    blender_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args(blender_args)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def configure_scene(background: tuple[float, float, float], exposure: float) -> bpy.types.Scene:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.image_settings.compression = 18
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = exposure
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Zombie Torch World")
    scene.world.use_nodes = True
    background_node = scene.world.node_tree.nodes.get("Background")
    background_node.inputs["Color"].default_value = (*background, 1.0)
    background_node.inputs["Strength"].default_value = 0.16
    return scene


def make_principled_material(
    name: str,
    color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return material


def make_fixture_material() -> bpy.types.Material:
    size = 8
    image = bpy.data.images.new("shoulder-torch-8px-armor", width=size, height=size, alpha=True)
    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            border = x == 0 or y == 0 or x == size - 1 or y == size - 1
            hazard = y in (2, 3)
            amber = hazard and (x + y) % 3 != 0
            variation = ((x * 13 + y * 7) % 4) * 5
            red = 18 if border else 214 if amber else 54 + variation
            green = 23 if border else 139 if amber else 65 + variation
            blue = 27 if border else 42 if amber else 70 + variation
            pixels.extend((red / 255, green / 255, blue / 255, 1.0))
    image.pixels.foreach_set(pixels)
    image.colorspace_settings.name = "sRGB"
    image.update()
    material = bpy.data.materials.new("8px graphite hazard armor")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = 0.58
    shader.inputs["Roughness"].default_value = 0.38
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Closest"
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return material


def make_lens_material() -> bpy.types.Material:
    material = bpy.data.materials.new("warm shoulder torch lens")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (1.0, 0.67, 0.32, 1.0)
    shader.inputs["Metallic"].default_value = 0.04
    shader.inputs["Roughness"].default_value = 0.18
    shader.inputs["Emission Color"].default_value = (1.0, 0.67, 0.32, 1.0)
    shader.inputs["Emission Strength"].default_value = 5.4
    return material


def make_text_material() -> bpy.types.Material:
    material = bpy.data.materials.new("design label")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.96, 0.9, 0.75, 1.0)
    shader.inputs["Roughness"].default_value = 0.55
    shader.inputs["Emission Color"].default_value = (0.28, 0.19, 0.08, 1.0)
    shader.inputs["Emission Strength"].default_value = 0.35
    return material


def add_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    parent: bpy.types.Object,
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.dimensions = dimensions
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def add_cylinder_y(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    parent: bpy.types.Object,
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=depth)
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.location = location
    obj.rotation_euler.x = math.pi / 2
    obj.data.materials.append(material)
    return obj


def add_octahedron(
    name: str,
    radius: float,
    location: tuple[float, float, float],
    parent: bpy.types.Object,
    material: bpy.types.Material,
) -> bpy.types.Object:
    vertices = [
        (radius, 0, 0),
        (-radius, 0, 0),
        (0, radius, 0),
        (0, -radius, 0),
        (0, 0, radius),
        (0, 0, -radius),
    ]
    faces = [
        (0, 2, 4),
        (2, 1, 4),
        (1, 3, 4),
        (3, 0, 4),
        (2, 0, 5),
        (1, 2, 5),
        (3, 1, 5),
        (0, 3, 5),
    ]
    mesh = bpy.data.meshes.new(f"{name}-mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.data.materials.append(material)
    return obj


def create_fixture(
    design: str,
    shell_material: bpy.types.Material,
    lens_material: bpy.types.Material,
) -> bpy.types.Object:
    root = bpy.data.objects.new(f"{design}-shoulder-torch", None)
    bpy.context.collection.objects.link(root)
    if design == "scout":
        add_cylinder_y("scout-housing", 0.09, 0.22, (0, 0, 0), root, shell_material)
        add_cylinder_y("scout-collar", 0.105, 0.04, (0, 0.12, 0), root, shell_material)
        add_box("scout-bracket", (0.12, 0.13, 0.055), (0, -0.045, -0.105), root, shell_material)
        add_octahedron("scout-gimbal", 0.052, (0, -0.07, -0.13), root, shell_material)
        add_cylinder_y("scout-lens", 0.072, 0.012, (0, 0.146, 0), root, lens_material)
    elif design == "breacher":
        add_box("breacher-housing", (0.24, 0.15, 0.095), (0, 0, 0), root, shell_material)
        add_box("breacher-bracket", (0.12, 0.12, 0.05), (0, -0.035, -0.09), root, shell_material)
        add_box("breacher-rail", (0.17, 0.1, 0.025), (0, -0.02, 0.064), root, shell_material)
        add_box("breacher-fin-left", (0.027, 0.12, 0.13), (-0.132, -0.01, 0), root, shell_material)
        add_box("breacher-fin-right", (0.027, 0.12, 0.13), (0.132, -0.01, 0), root, shell_material)
        add_octahedron("breacher-gimbal", 0.048, (0, -0.065, -0.115), root, shell_material)
        add_box("breacher-lens-left", (0.075, 0.012, 0.044), (-0.052, 0.081, 0.002), root, lens_material)
        add_box("breacher-lens-right", (0.075, 0.012, 0.044), (0.052, 0.081, 0.002), root, lens_material)
    else:
        add_box("sentinel-housing", (0.18, 0.22, 0.13), (0, 0, 0), root, shell_material)
        add_box("sentinel-bracket", (0.115, 0.13, 0.05), (0, -0.035, -0.115), root, shell_material)
        add_box("sentinel-rail", (0.125, 0.14, 0.025), (0, -0.025, 0.08), root, shell_material)
        add_cylinder_y("sentinel-bezel", 0.105, 0.075, (0, 0.135, 0), root, shell_material)
        add_box("sentinel-fin-left", (0.024, 0.14, 0.115), (-0.104, -0.015, 0), root, shell_material)
        add_box("sentinel-fin-right", (0.024, 0.14, 0.115), (0.104, -0.015, 0), root, shell_material)
        add_octahedron("sentinel-gimbal", 0.052, (0, -0.075, -0.14), root, shell_material)
        add_cylinder_y("sentinel-lens", 0.078, 0.014, (0, 0.18, 0), root, lens_material)
    return root


def add_floor(material: bpy.types.Material, size: float = 14.0) -> bpy.types.Object:
    root = bpy.data.objects.new("floor-root", None)
    bpy.context.collection.objects.link(root)
    return add_box("ground", (size, size, 0.08), (0, 0, -0.04), root, material)


def add_camera(
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    lens: float,
) -> bpy.types.Object:
    camera_data = bpy.data.cameras.new("Camera")
    camera_data.lens = lens
    camera = bpy.data.objects.new("Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = location
    look_at(camera, Vector(target))
    bpy.context.scene.camera = camera
    return camera


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("-Z", "Y")


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    size: float,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    look_at(light, Vector(target))
    return light


def add_text(
    body: str,
    location: tuple[float, float, float],
    camera: bpy.types.Object,
    material: bpy.types.Material,
    size: float,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(body, type="FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.space_line = 0.82
    curve.extrude = 0.002
    obj = bpy.data.objects.new(body, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    direction = camera.location - obj.location
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(material)
    return obj


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    return minimum, maximum


def import_robot() -> bpy.types.Object:
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROBOT_PATH))
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    armature = next(obj for obj in imported if obj.type == "ARMATURE")
    armature.animation_data_create()
    armature.animation_data.action = bpy.data.actions.get("Idle_11")
    bpy.context.scene.frame_set(34)
    root = bpy.data.objects.new("production-orbot-root", None)
    bpy.context.collection.objects.link(root)
    for obj in imported:
        if obj.parent is None:
            obj.parent = root
    bpy.context.view_layer.update()
    minimum, maximum = world_bounds(imported)
    root.scale = (TARGET_ROBOT_HEIGHT / (maximum.z - minimum.z),) * 3
    bpy.context.view_layer.update()
    minimum, maximum = world_bounds(imported)
    center = (minimum + maximum) * 0.5
    root.location = (-center.x, -center.y, -minimum.z)
    bpy.context.view_layer.update()
    return armature


def shoulder_position(armature: bpy.types.Object, bone_name: str) -> Vector:
    return armature.matrix_world @ armature.pose.bones[bone_name].head


def add_spot_light(origin: Vector, target: Vector) -> bpy.types.Object:
    data = bpy.data.lights.new("shoulder torch spot", type="SPOT")
    data.color = (1.0, 0.67, 0.32)
    data.energy = 1480.0
    data.spot_size = 0.6
    data.spot_blend = 0.76
    data.shadow_soft_size = 0.055
    light = bpy.data.objects.new("shoulder torch spot", data)
    bpy.context.collection.objects.link(light)
    light.location = origin
    look_at(light, target)
    return light


def make_beam_volume_material(name: str, density: float, emission_strength: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    volume = nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Color"].default_value = (1.0, 0.67, 0.32, 1.0)
    volume.inputs["Density"].default_value = density
    volume.inputs["Emission Color"].default_value = (1.0, 0.67, 0.32, 1.0)
    volume.inputs["Emission Strength"].default_value = emission_strength
    material.node_tree.links.new(volume.outputs["Volume"], output.inputs["Volume"])
    return material


def add_beam_volume(
    origin: Vector,
    target: Vector,
    radius: float,
    material: bpy.types.Material,
    start_radius: float = 0.018,
) -> bpy.types.Object:
    direction = target - origin
    length = direction.length
    bpy.ops.mesh.primitive_cone_add(
        vertices=12,
        radius1=start_radius,
        radius2=radius,
        depth=length,
    )
    beam = bpy.context.object
    beam.name = "unified shoulder light ray"
    beam.location = (origin + target) * 0.5
    beam.rotation_mode = "QUATERNION"
    beam.rotation_quaternion = direction.to_track_quat("Z", "Y")
    beam.data.materials.append(material)
    beam.visible_shadow = False
    return beam


def add_unified_beam_volume(
    origins: list[Vector],
    merge: Vector,
    target: Vector,
    radius: float,
    feed_material: bpy.types.Material,
    body_material: bpy.types.Material,
) -> bpy.types.Object:
    parts = [
        add_beam_volume(origins[0], merge, 0.11, feed_material, 0.012),
        add_beam_volume(origins[1], merge, 0.11, feed_material, 0.012),
        add_beam_volume(merge, target, radius, body_material, 0.11),
    ]
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[-1]
    bpy.ops.object.join()
    beam = bpy.context.object
    beam.name = "unified two-source shoulder light ray"
    return beam


def mount_sentinel_pair(
    armature: bpy.types.Object,
    shell_material: bpy.types.Material,
    lens_material: bpy.types.Material,
    visible_beams: bool,
) -> None:
    left = shoulder_position(armature, "LeftShoulder")
    right = shoulder_position(armature, "RightShoulder")
    center = (left + right) * 0.5
    target = Vector((0.0, -5.4, 0.035))
    outer_volume = make_beam_volume_material("unified beam volume", 0.008, 0.055)
    feed_volume = make_beam_volume_material("lens-connected feeder volume", 0.02, 0.075)
    mounts: list[Vector] = []
    for shoulder in (left, right):
        outward = shoulder - center
        outward.z = 0
        outward.normalize()
        mounts.append(shoulder + outward * 0.06 + Vector((0, -0.02, 0.055)))
    shared_mount = (mounts[0] + mounts[1]) * 0.5
    merge = shared_mount + (target - shared_mount).normalized() * 0.8
    beam_origins: list[Vector] = []
    for mount in mounts:
        direction = (merge - mount).normalized()
        fixture = create_fixture("sentinel", shell_material, lens_material)
        fixture.location = mount
        fixture.scale = (0.18, 0.18, 0.18)
        fixture.rotation_mode = "QUATERNION"
        fixture.rotation_quaternion = direction.to_track_quat("Y", "Z")
        bpy.context.view_layer.update()
        beam_origins.append(mount + direction * 0.0337)
    beam_origin = (beam_origins[0] + beam_origins[1]) * 0.5
    add_spot_light(beam_origin, target)
    if visible_beams:
        add_unified_beam_volume(beam_origins, merge, target, 1.45, feed_volume, outer_volume)


def add_scene_header(
    title: str,
    subtitle: str,
    camera: bpy.types.Object,
    material: bpy.types.Material,
) -> None:
    distance = 4.0
    half_height = distance * math.tan(camera.data.angle_y * 0.5)
    for body, screen_y, size in (
        (title, 0.58, half_height * 0.09),
        (subtitle, 0.4, half_height * 0.058),
    ):
        curve = bpy.data.curves.new(body, type="FONT")
        curve.body = body
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = size
        curve.extrude = 0.002
        obj = bpy.data.objects.new(body, curve)
        bpy.context.collection.objects.link(obj)
        obj.parent = camera
        obj.location = (0, half_height * screen_y, -distance)
        obj.data.materials.append(material)


def render_design_gallery(output_dir: Path) -> None:
    reset_scene()
    scene = configure_scene((0.006, 0.012, 0.026), 0.15)
    shell = make_fixture_material()
    lens = make_lens_material()
    floor_material = make_principled_material("gallery floor", (0.025, 0.038, 0.055, 1), 0.1, 0.86)
    stand_material = make_principled_material("display stands", (0.07, 0.1, 0.13, 1), 0.58, 0.35)
    text_material = make_text_material()
    add_floor(floor_material, 12)
    camera = add_camera((0, 7.2, 3.15), (0, 0.05, 1.12), 51)
    for index, design in enumerate(DESIGN_ORDER):
        x = (index - 1) * 1.55
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.48, depth=0.13, location=(x, 0, 0.32))
        bpy.context.object.data.materials.append(stand_material)
        for side in (-1, 1):
            fixture = create_fixture(design, shell, lens)
            fixture.location = (x + side * 0.16, 0.08, 1.12)
            fixture.scale = (1.8, 1.8, 1.8)
        name, budget = DESIGN_LABELS[design]
        add_text(f"{name}\n{budget}", (x, 0.22, 0.63), camera, text_material, 0.13)
    add_area_light("warm key", (3.6, 4.8, 6.2), (0, 0, 1), 920, (1.0, 0.73, 0.42), 4.0)
    add_area_light("cool fill", (-4.5, 2.0, 3.3), (0, 0, 1.1), 760, (0.25, 0.52, 1.0), 4.5)
    add_area_light("rim", (0, -3.5, 4.8), (0, 0, 1), 1050, (0.35, 0.62, 1.0), 3.2)
    add_scene_header(
        "ZOMBIE SHOULDER TORCHES",
        "8x8 texture  /  10x inspection previews  /  deployed at 0.18 scale",
        camera,
        text_material,
    )
    scene.render.filepath = str(output_dir / "zombie-shoulder-torch-designs.png")
    bpy.ops.render.render(write_still=True)


def render_mounted(output_dir: Path) -> None:
    reset_scene()
    scene = configure_scene((0.004, 0.008, 0.018), 0.1)
    shell = make_fixture_material()
    lens = make_lens_material()
    floor_material = make_principled_material("mounted floor", (0.026, 0.038, 0.045, 1), 0.08, 0.92)
    add_floor(floor_material, 12)
    armature = import_robot()
    mount_sentinel_pair(armature, shell, lens, False)
    camera = add_camera((1.35, -2.55, 2.05), (0, -0.05, 1.38), 63)
    add_area_light("face key", (3.2, -3.7, 4.8), (0, 0, 1.25), 980, (1.0, 0.72, 0.4), 3.0)
    add_area_light("blue rim", (-3.2, 1.8, 3.2), (0, 0, 1.3), 1150, (0.18, 0.48, 1.0), 3.4)
    add_area_light("soft fill", (-2.2, -3.1, 1.8), (0, 0, 1.25), 620, (0.5, 0.68, 1.0), 2.8)
    scene.render.filepath = str(output_dir / "zombie-shoulder-torch-mounted.png")
    bpy.ops.render.render(write_still=True)


def render_beams(output_dir: Path) -> None:
    reset_scene()
    scene = configure_scene((0.0015, 0.003, 0.008), -0.2)
    shell = make_fixture_material()
    lens = make_lens_material()
    ground = make_principled_material("night ground", (0.052, 0.052, 0.052, 1), 0.02, 0.94)
    crate = make_principled_material("lit obstacle", (0.13, 0.115, 0.095, 1), 0.04, 0.88)
    rock = make_principled_material("lit rock", (0.095, 0.095, 0.09, 1), 0.02, 0.98)
    text_material = make_text_material()
    add_floor(ground, 16)
    armature = import_robot()
    mount_sentinel_pair(armature, shell, lens, True)
    root = bpy.data.objects.new("beam targets", None)
    bpy.context.collection.objects.link(root)
    add_box("crate", (0.72, 0.68, 0.58), (-0.65, -3.85, 0.29), root, crate).rotation_euler.z = 0.26
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.43, location=(0.85, -4.6, 0.35))
    bpy.context.object.scale = (1.15, 0.9, 0.75)
    bpy.context.object.data.materials.append(rock)
    camera = add_camera((4.2, 3.6, 4.2), (0, -2.85, 0.48), 50)
    add_area_light("moon rim", (-3.2, 3.5, 5.5), (0, -1.5, 0.8), 520, (0.16, 0.34, 0.72), 4.2)
    add_area_light("night fill", (4.5, -1.2, 3.0), (0, -2.5, 0.7), 180, (0.2, 0.38, 0.6), 4.0)
    add_scene_header(
        "UNIFIED AIM-LINKED LIGHT",
        "two lamp feeds merge into one wide spot with one matched warm color",
        camera,
        text_material,
    )
    scene.render.filepath = str(output_dir / "zombie-shoulder-torch-beams.png")
    bpy.ops.render.render(write_still=True)


def render_merge_detail(output_dir: Path) -> None:
    reset_scene()
    scene = configure_scene((0.0015, 0.003, 0.008), -0.1)
    shell = make_fixture_material()
    lens = make_lens_material()
    ground = make_principled_material("merge detail ground", (0.052, 0.052, 0.052, 1), 0.02, 0.94)
    text_material = make_text_material()
    add_floor(ground, 12)
    armature = import_robot()
    mount_sentinel_pair(armature, shell, lens, True)
    camera = add_camera((0.7, 1.6, 4.0), (0, -0.6, 1.0), 55)
    add_area_light("detail rim", (-2.4, 1.8, 3.8), (0, -0.2, 1.4), 680, (0.2, 0.42, 0.82), 3.0)
    add_scene_header(
        "TWO TORCH ORIGINS / ONE LIGHT",
        "the feeds join before the single wide beam and single ground spot",
        camera,
        text_material,
    )
    scene.render.filepath = str(output_dir / "zombie-shoulder-torch-merge-detail.png")
    bpy.ops.render.render(write_still=True)


def render_origin_closeups(output_dir: Path) -> None:
    reset_scene()
    scene = configure_scene((0.0015, 0.003, 0.008), -0.15)
    shell = make_fixture_material()
    lens = make_lens_material()
    ground = make_principled_material("origin detail ground", (0.035, 0.04, 0.045, 1), 0.02, 0.94)
    add_floor(ground, 12)
    armature = import_robot()
    mount_sentinel_pair(armature, shell, lens, True)
    camera = add_camera((1.8, -1.85, 2.45), (0, -0.45, 1.5), 70)
    add_area_light("origin key", (2.7, -2.2, 3.3), (0, -0.15, 1.55), 760, (1.0, 0.72, 0.42), 2.0)
    add_area_light("origin rim", (-2.0, 0.8, 2.9), (0, -0.2, 1.5), 620, (0.2, 0.42, 0.82), 2.5)
    scene.render.filepath = str(output_dir / "zombie-shoulder-torch-origin-front.png")
    bpy.ops.render.render(write_still=True)
    camera.location = (1.5, -0.8, 2.8)
    camera.data.lens = 58
    look_at(camera, Vector((0, -0.5, 1.45)))
    scene.render.filepath = str(output_dir / "zombie-shoulder-torch-origin-side.png")
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    render_design_gallery(output_dir)
    render_mounted(output_dir)
    render_beams(output_dir)
    render_merge_detail(output_dir)
    render_origin_closeups(output_dir)
    print(f"Rendered shoulder torch evidence to {output_dir}")


if __name__ == "__main__":
    main()
