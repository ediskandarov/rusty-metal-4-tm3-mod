#ifndef TM3_WEAPON_GEOMETRY_H
#define TM3_WEAPON_GEOMETRY_H
#include <stddef.h>
#include <stdint.h>

typedef struct {
    const uint8_t *bytes, *faces, *vertices, *materials;
    size_t material_bytes;
    uint32_t face_count, vertex_count;
} Tm3WeaponGeometry;
typedef struct {
    uint32_t first_face;
    uint16_t first_vertex;
    uint8_t vertex_count, face_count;
} Tm3WeaponGroup;
typedef struct {
    uint8_t shade, double_sided, command, vertices[4], texture[12];
} Tm3WeaponFace;

/* Read the unrelocated TER block 7. Offsets remain relative to the original
   streams; the source bytes are never modified or used as host pointers. */
int Tm3WeaponGeometryRead(Tm3WeaponGeometry* mesh, const uint8_t* bytes, size_t size);
int Tm3WeaponGroupRead(const Tm3WeaponGeometry* mesh, uint32_t descriptor, Tm3WeaponGroup* group);
int Tm3WeaponFaceRead(const Tm3WeaponGeometry* mesh, const Tm3WeaponGroup* group, uint32_t index,
    uint32_t variant, Tm3WeaponFace* face);
void Tm3WeaponVertexRead(const Tm3WeaponGeometry* mesh, const Tm3WeaponGroup* group, uint32_t index,
    int16_t position[3]);
#endif
