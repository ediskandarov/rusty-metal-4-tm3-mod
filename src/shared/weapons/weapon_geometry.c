#include "tm3/weapon_geometry.h"
#include <string.h>

static uint16_t read16(const uint8_t* bytes)
{
    return (uint16_t)(bytes[0] | (uint16_t)bytes[1] << 8);
}
static uint32_t read32(const uint8_t* bytes)
{
    return bytes[0] | (uint32_t)bytes[1] << 8 | (uint32_t)bytes[2] << 16 | (uint32_t)bytes[3] << 24;
}
int Tm3WeaponGeometryRead(Tm3WeaponGeometry* mesh, const uint8_t* bytes, size_t size)
{
    memset(mesh, 0, sizeof(*mesh));
    if (!bytes || size < 0x39c)
        return 0;
    uint32_t faces = read32(bytes + 0x388), vertices = read32(bytes + 0x38c);
    size_t remaining = size - 0x39c;
    if (faces > remaining / 12)
        return 0;
    remaining -= (size_t)faces * 12;
    if (vertices > remaining / 8)
        return 0;
    mesh->bytes = bytes;
    mesh->faces = bytes + 0x39c;
    mesh->vertices = mesh->faces + (size_t)faces * 12;
    mesh->materials = mesh->vertices + (size_t)vertices * 8;
    mesh->material_bytes = remaining - (size_t)vertices * 8;
    mesh->face_count = faces;
    mesh->vertex_count = vertices;
    return 1;
}
int Tm3WeaponGroupRead(const Tm3WeaponGeometry* mesh, uint32_t descriptor, Tm3WeaponGroup* group)
{
    if (!mesh->bytes || descriptor > 0x388 - 8)
        return 0;
    const uint8_t* p = mesh->bytes + descriptor;
    uint16_t first_vertex = read16(p + 2);
    uint32_t face_offset = read32(p + 4);
    if (face_offset % 12 || first_vertex > mesh->vertex_count
        || p[0] > mesh->vertex_count - first_vertex || face_offset / 12 > mesh->face_count
        || p[1] > mesh->face_count - face_offset / 12)
        return 0;
    group->vertex_count = p[0];
    group->face_count = p[1];
    group->first_vertex = first_vertex;
    group->first_face = face_offset / 12;
    return 1;
}
int Tm3WeaponFaceRead(const Tm3WeaponGeometry* mesh, const Tm3WeaponGroup* group, uint32_t index,
    uint32_t variant, Tm3WeaponFace* face)
{
    if (index >= group->face_count)
        return 0;
    const uint8_t* p = mesh->faces + (size_t)(group->first_face + index) * 12;
    int count = (p[3] & ~2) == 0x24 ? 3 : (p[3] & ~2) == 0x2c ? 4 : 0;
    if (!count)
        return 0;
    for (int i = 0; i < count; ++i)
        if (p[4 + i] >= group->vertex_count)
            return 0;
    uint32_t material = read32(p + 8);
    if (material > mesh->material_bytes || mesh->material_bytes - material < 12
        || variant > (mesh->material_bytes - material - 12) / 12)
        return 0;
    face->shade = p[0];
    face->double_sided = p[1];
    face->command = p[3];
    memcpy(face->vertices, p + 4, 4);
    memcpy(face->texture, mesh->materials + material + (size_t)variant * 12, 12);
    return 1;
}
void Tm3WeaponVertexRead(
    const Tm3WeaponGeometry* mesh, const Tm3WeaponGroup* group, uint32_t index, int16_t position[3])
{
    const uint8_t* p = mesh->vertices + (size_t)(group->first_vertex + index) * 8;
    for (int axis = 0; axis < 3; ++axis) {
        uint16_t value = read16(p + axis * 2);
        position[axis] = value <= INT16_MAX ? (int16_t)value : (int16_t)(-1 - (UINT16_MAX - value));
    }
}
