import { MAX_PROCESSING_EDGE } from "@/lib/constants";
import { applyFilter } from "@/lib/filters";
import { denormalizeQuad, outputSizeForQuad } from "@/lib/geometry";
import type { FilterId, Quad, Raster } from "@/lib/types";
import { warpRaster } from "@/lib/warp";

export function warpDocumentRaster(raster: Raster, quad: Quad, maxEdge = MAX_PROCESSING_EDGE): Raster {
  const pixels = denormalizeQuad(quad, raster.width, raster.height);
  const size = outputSizeForQuad(pixels, maxEdge);
  return warpRaster(raster, pixels, size.width, size.height);
}

export function processRaster(
  raster: Raster,
  quad: Quad,
  filter: FilterId,
  maxEdge = MAX_PROCESSING_EDGE,
): Raster {
  return applyFilter(warpDocumentRaster(raster, quad, maxEdge), filter);
}
