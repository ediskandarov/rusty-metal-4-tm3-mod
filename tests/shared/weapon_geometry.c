#include "tm3/weapon_geometry.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void word(uint8_t* bytes, uint32_t value)
{
    for (int i = 0; i < 4; ++i)
        bytes[i] = value >> (i * 8);
}
static void synthetic(void)
{
    uint8_t bytes[0x39c + 12 + 4 * 8 + 24] = { 0 };
    word(bytes + 0x388, 1);
    word(bytes + 0x38c, 4);
    bytes[0] = 4;
    bytes[1] = 1;
    uint8_t* raw = bytes + 0x39c;
    raw[0] = 128;
    raw[3] = 0x2e;
    raw[4] = 0;
    raw[5] = 1;
    raw[6] = 2;
    raw[7] = 3;
    uint8_t* vertex = raw + 12;
    vertex[0] = 0xff;
    vertex[1] = 0xff;
    vertex[2] = 0x00;
    vertex[3] = 0x80;
    vertex[4] = 0xff;
    vertex[5] = 0x7f;
    uint8_t* material = vertex + 32;
    for (int i = 0; i < 24; ++i)
        material[i] = i;
    Tm3WeaponGeometry mesh;
    Tm3WeaponGroup group;
    Tm3WeaponFace face;
    assert(Tm3WeaponGeometryRead(&mesh, bytes, sizeof(bytes)));
    assert(Tm3WeaponGroupRead(&mesh, 0, &group));
    assert(Tm3WeaponFaceRead(&mesh, &group, 0, 0, &face));
    assert(face.command == 0x2e && face.shade == 128 && !face.double_sided);
    assert(!memcmp(face.texture, material, 12));
    assert(Tm3WeaponFaceRead(&mesh, &group, 0, 1, &face));
    assert(!memcmp(face.texture, material + 12, 12));
    assert(!Tm3WeaponFaceRead(&mesh, &group, 0, 2, &face));
    assert(!Tm3WeaponFaceRead(&mesh, &group, 0, UINT32_MAX, &face));
    assert(!Tm3WeaponFaceRead(&mesh, &group, 1, 0, &face));
    int16_t p[3];
    Tm3WeaponVertexRead(&mesh, &group, 0, p);
    assert(p[0] == -1 && p[1] == -32768 && p[2] == 32767);
    raw[7] = 4;
    assert(!Tm3WeaponFaceRead(&mesh, &group, 0, 0, &face));
    raw[3] = 0x26; /* The triangle's unused fourth index is not a vertex. */
    assert(Tm3WeaponFaceRead(&mesh, &group, 0, 0, &face));
    raw[3] = 0x28;
    assert(!Tm3WeaponFaceRead(&mesh, &group, 0, 0, &face));
    raw[3] = 0x24;
    word(raw + 8, UINT32_MAX);
    assert(!Tm3WeaponFaceRead(&mesh, &group, 0, 0, &face));
    word(bytes + 4, 1);
    assert(!Tm3WeaponGroupRead(&mesh, 0, &group));
    word(bytes + 4, 12);
    assert(!Tm3WeaponGroupRead(&mesh, 0, &group));
    word(bytes + 4, 0);
    bytes[2] = 1;
    assert(!Tm3WeaponGroupRead(&mesh, 0, &group));
    assert(!Tm3WeaponGroupRead(&mesh, UINT32_MAX, &group));
    for (size_t size = 0; size < 0x39c + 12 + 32; ++size)
        assert(!Tm3WeaponGeometryRead(&mesh, bytes, size));
    assert(!mesh.bytes);
    word(bytes + 0x388, UINT32_MAX);
    assert(!Tm3WeaponGeometryRead(&mesh, bytes, sizeof(bytes)));
    word(bytes + 0x388, 1);
    word(bytes + 0x38c, UINT32_MAX);
    assert(!Tm3WeaponGeometryRead(&mesh, bytes, sizeof(bytes)));
}
static void original(const char* path)
{
    FILE* file = fopen(path, "rb");
    assert(file);
    uint8_t bytes[4708];
    assert(fread(bytes, 1, sizeof(bytes), file) == sizeof(bytes));
    assert(fgetc(file) == EOF);
    fclose(file);
    uint8_t before[sizeof(bytes)];
    memcpy(before, bytes, sizeof(bytes));
    Tm3WeaponGeometry mesh;
    assert(Tm3WeaponGeometryRead(&mesh, bytes, sizeof(bytes)));
    assert(mesh.face_count == 113 && mesh.vertex_count == 164);
    assert(mesh.material_bytes == 1116);
    const int counts[9][2] = {
        { 17, 7 },
        { 17, 20 },
        { 21, 15 },
        { 8, 12 },
        { 13, 13 },
        { 6, 4 },
        { 45, 17 },
        { 5, 4 },
        { 32, 21 },
    };
    uint32_t total = 0;
    for (uint32_t i = 0; i < 9; ++i) {
        Tm3WeaponGroup group;
        assert(Tm3WeaponGroupRead(&mesh, i * 8, &group));
        assert(group.vertex_count == counts[i][0] && group.face_count == counts[i][1]);
        for (uint32_t f = 0; f < group.face_count; ++f) {
            Tm3WeaponFace face;
            assert(Tm3WeaponFaceRead(&mesh, &group, f, 0, &face));
            ++total;
        }
    }
    assert(total == 113);
    Tm3WeaponGroup rocket;
    Tm3WeaponFace face;
    assert(Tm3WeaponGroupRead(&mesh, 0, &rocket));
    int16_t p[3];
    Tm3WeaponVertexRead(&mesh, &rocket, 0, p);
    assert(p[0] == -12 && p[1] == 12 && p[2] == -59);
    assert(Tm3WeaponFaceRead(&mesh, &rocket, 0, 0, &face));
    const uint8_t uv[] = { 112, 78, 111, 89, 112, 64, 26, 0, 126, 78, 126, 64 };
    assert(face.command == 0x2c && face.shade == 128);
    assert(!memcmp(face.texture, uv, sizeof(uv)));
    assert(!memcmp(before, bytes, sizeof(bytes)));
}
int main(int argc, char** argv)
{
    synthetic();
    if (argc == 2)
        original(argv[1]);
    puts("TM3 weapon geometry: streams, variants and malformed ranges passed");
    return 0;
}
