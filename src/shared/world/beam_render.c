#include "assets.h"
#include "tm4/main/math3d.h"

/* 80038234 visits the far half first and tiles the complete UV rectangle on each leaf. */
static void draw_beam_section(const SVECTOR quad[4], const Tm4CardQuadTexture* material,
    Tm4OrderingTag* order, u8** cursor, u8* limit)
{
    VECTOR edge = { quad[0].vx - quad[1].vx, quad[0].vy - quad[1].vy, quad[0].vz - quad[1].vz, 0 };
    if (VectorLength0(&edge) / 2 <= 512) {
        CardDisplayTexturedQuad((SVECTOR*)quad, 0x585858, (Tm4CardQuadTexture*)material, order,
            (Tm4CardPacket**)cursor, 1, limit, 128);
        return;
    }
    SVECTOR far[4], near[4];
    for (int i = 0; i < 4; i += 2) {
        SVECTOR mid = { (quad[i].vx + quad[i + 1].vx) / 2, (quad[i].vy + quad[i + 1].vy) / 2,
            (quad[i].vz + quad[i + 1].vz) / 2, 0 };
        far[i] = near[i + 1] = mid;
        far[i + 1] = quad[i + 1];
        near[i] = quad[i];
    }
    draw_beam_section(far, material, order, cursor, limit);
    draw_beam_section(near, material, order, cursor, limit);
}

void Tm3DrawMapBeam(const SVECTOR* origin, const s16 end[3], const MATRIX* pose,
    Tm4OrderingTag* order, u8** cursor, u8* limit, MATRIX* view)
{
    u32 offset = Tm3ReadU32(Tm3WeaponData + 0x328);
    if (offset > Tm3WeaponMesh.material_bytes
        || Tm3WeaponMesh.material_bytes - offset < sizeof(Tm4CardQuadTexture))
        return;
    Tm4CardQuadTexture texture;
    Tm3CopyTexture(&texture, Tm3WeaponMesh.materials + offset);
    SVECTOR quad[4];
    for (int i = 0; i < 2; ++i) {
        SVECTOR local = { i ? 256 : -256, 0, 0, 0 }, width;
        ApplyMatrixSV((MATRIX*)pose, &local, &width);
        quad[2 * i]
            = (SVECTOR) { origin->vx + width.vx, origin->vy + width.vy, origin->vz + width.vz, 0 };
        quad[2 * i + 1] = (SVECTOR) { end[0] + width.vx, end[1] + width.vy, end[2] + width.vz, 0 };
    }
    PushMatrix();
    SetRotMatrix(view);
    SetTransMatrix(view);
    draw_beam_section(quad, &texture, order, cursor, limit);
    PopMatrix();
}
