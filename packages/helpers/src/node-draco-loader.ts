import { createRequire } from "node:module";

import { BufferAttribute, BufferGeometry } from "three";

const require = createRequire(import.meta.url);

type TypedArrayName =
  | "Float32Array"
  | "Int8Array"
  | "Int16Array"
  | "Int32Array"
  | "Uint8Array"
  | "Uint16Array"
  | "Uint32Array";

type SupportedTypedArray =
  | Float32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

type SupportedTypedArrayConstructor =
  | Float32ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor;

type DracoAttributeTypes = Partial<Record<string, TypedArrayName | SupportedTypedArrayConstructor>>;
type DracoAttributeIds = Record<string, number | string>;

const DEFAULT_DRACO_ATTRIBUTE_IDS: DracoAttributeIds = {
  position: "POSITION",
  normal: "NORMAL",
  color: "COLOR",
  uv: "TEX_COORD",
};

const DEFAULT_DRACO_ATTRIBUTE_TYPES: DracoAttributeTypes = {
  position: "Float32Array",
  normal: "Float32Array",
  color: "Float32Array",
  uv: "Float32Array",
};

type DracoStatus = {
  ok(): boolean;
  error_msg(): string;
};

type DracoPointAttribute = {
  num_components(): number;
};

type DracoPointCloud = {
  ptr: number;
  num_points(): number;
};

type DracoMesh = DracoPointCloud & {
  num_faces(): number;
};

type DracoDecoderBuffer = {
  Init(data: Int8Array, byteLength: number): void;
};

type DracoDecoder = {
  GetEncodedGeometryType(buffer: DracoDecoderBuffer): number;
  DecodeBufferToMesh(buffer: DracoDecoderBuffer, mesh: DracoMesh): DracoStatus;
  DecodeBufferToPointCloud(buffer: DracoDecoderBuffer, pointCloud: DracoPointCloud): DracoStatus;
  GetAttributeId(geometry: DracoPointCloud, type: number): number;
  GetAttribute(geometry: DracoPointCloud, attributeId: number): DracoPointAttribute;
  GetAttributeByUniqueId(geometry: DracoPointCloud, uniqueId: number): DracoPointAttribute;
  GetTrianglesUInt32Array(geometry: DracoMesh, byteLength: number, pointer: number): boolean;
  GetAttributeDataArrayForAllPoints(
    geometry: DracoPointCloud,
    attribute: DracoPointAttribute,
    dataType: number,
    byteLength: number,
    pointer: number,
  ): boolean;
};

type DracoDecoderModule = {
  Decoder: new () => DracoDecoder;
  DecoderBuffer: new () => DracoDecoderBuffer;
  Mesh: new () => DracoMesh;
  PointCloud: new () => DracoPointCloud;
  TRIANGULAR_MESH: number;
  POINT_CLOUD: number;
  POSITION: number;
  NORMAL: number;
  COLOR: number;
  TEX_COORD: number;
  DT_FLOAT32: number;
  DT_INT8: number;
  DT_INT16: number;
  DT_INT32: number;
  DT_UINT8: number;
  DT_UINT16: number;
  DT_UINT32: number;
  HEAPU8: { buffer: ArrayBufferLike };
  _malloc(byteLength: number): number;
  _free(pointer: number): void;
  destroy(target: unknown): void;
};

type Draco3DPackage = {
  createDecoderModule(config: Record<string, never>): Promise<DracoDecoderModule>;
};

type GltfDracoDecoder = {
  preload(): GltfDracoDecoder;
  dispose(): GltfDracoDecoder;
  decodeDracoFile(
    buffer: ArrayBuffer,
    onLoad: (geometry: BufferGeometry) => void,
    attributeIds?: DracoAttributeIds,
    attributeTypes?: DracoAttributeTypes,
    vertexColorSpace?: unknown,
    onError?: (error: unknown) => void,
  ): void;
};

const TYPED_ARRAY_CONSTRUCTORS: Record<TypedArrayName, SupportedTypedArrayConstructor> = {
  Float32Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array,
};

let decoderModulePromise: Promise<DracoDecoderModule> | undefined;

function getDecoderModule(): Promise<DracoDecoderModule> {
  decoderModulePromise ??= (require("draco3d") as Draco3DPackage).createDecoderModule({});
  return decoderModulePromise;
}

function resolveAttributeArrayConstructor(
  attributeType: TypedArrayName | SupportedTypedArrayConstructor | undefined,
): SupportedTypedArrayConstructor {
  if (!attributeType) {
    return Float32Array;
  }
  if (typeof attributeType !== "string") {
    return attributeType;
  }

  const constructor = TYPED_ARRAY_CONSTRUCTORS[attributeType];
  if (!constructor) {
    throw new Error(`node-draco-loader: unsupported attribute array type "${attributeType}"`);
  }
  return constructor;
}

function getDracoDataType(
  draco: DracoDecoderModule,
  attributeType: SupportedTypedArrayConstructor,
): number {
  switch (attributeType) {
    case Float32Array:
      return draco.DT_FLOAT32;
    case Int8Array:
      return draco.DT_INT8;
    case Int16Array:
      return draco.DT_INT16;
    case Int32Array:
      return draco.DT_INT32;
    case Uint8Array:
      return draco.DT_UINT8;
    case Uint16Array:
      return draco.DT_UINT16;
    case Uint32Array:
      return draco.DT_UINT32;
    default:
      throw new Error(`node-draco-loader: unsupported Draco data type "${attributeType.name}"`);
  }
}

function decodeTriangleIndex(
  draco: DracoDecoderModule,
  decoder: DracoDecoder,
  geometry: DracoMesh,
): BufferAttribute {
  const indexCount = geometry.num_faces() * 3;
  const byteLength = indexCount * Uint32Array.BYTES_PER_ELEMENT;
  const pointer = draco._malloc(byteLength);

  try {
    if (!decoder.GetTrianglesUInt32Array(geometry, byteLength, pointer)) {
      throw new Error("node-draco-loader: failed to decode Draco triangle indices");
    }

    const view = new Uint32Array(draco.HEAPU8.buffer as ArrayBuffer, pointer, indexCount);
    return new BufferAttribute(new Uint32Array(view), 1);
  } finally {
    draco._free(pointer);
  }
}

function decodeVertexAttribute(
  draco: DracoDecoderModule,
  decoder: DracoDecoder,
  geometry: DracoPointCloud,
  attributeName: string,
  attributeType: SupportedTypedArrayConstructor,
  attribute: DracoPointAttribute,
): BufferAttribute {
  const itemSize = attribute.num_components();
  const valueCount = geometry.num_points() * itemSize;
  const byteLength = valueCount * attributeType.BYTES_PER_ELEMENT;
  const dataType = getDracoDataType(draco, attributeType);
  const pointer = draco._malloc(byteLength);

  try {
    if (
      !decoder.GetAttributeDataArrayForAllPoints(geometry, attribute, dataType, byteLength, pointer)
    ) {
      throw new Error(`node-draco-loader: failed to decode Draco attribute "${attributeName}"`);
    }

    const view = new attributeType(
      draco.HEAPU8.buffer as ArrayBuffer,
      pointer,
      valueCount,
    ) as SupportedTypedArray;
    return new BufferAttribute(new attributeType(view), itemSize);
  } finally {
    draco._free(pointer);
  }
}

function getAttributeId(
  draco: DracoDecoderModule,
  decoder: DracoDecoder,
  geometry: DracoPointCloud,
  attributeIdOrSemantic: number | string,
  useUniqueIds: boolean,
): number {
  if (useUniqueIds) {
    return Number(attributeIdOrSemantic);
  }

  return decoder.GetAttributeId(
    geometry,
    draco[String(attributeIdOrSemantic) as keyof DracoDecoderModule] as number,
  );
}

function buildGeometryFromDracoBuffer(
  draco: DracoDecoderModule,
  decoder: DracoDecoder,
  decoderBuffer: DracoDecoderBuffer,
  attributeIds: DracoAttributeIds,
  attributeTypes: DracoAttributeTypes,
  useUniqueIds: boolean,
): BufferGeometry {
  const geometryType = decoder.GetEncodedGeometryType(decoderBuffer);
  const dracoGeometry =
    geometryType === draco.TRIANGULAR_MESH ? new draco.Mesh() : new draco.PointCloud();

  const status =
    geometryType === draco.TRIANGULAR_MESH
      ? decoder.DecodeBufferToMesh(decoderBuffer, dracoGeometry as DracoMesh)
      : geometryType === draco.POINT_CLOUD
        ? decoder.DecodeBufferToPointCloud(decoderBuffer, dracoGeometry)
        : null;

  if (!status) {
    draco.destroy(dracoGeometry);
    throw new Error("node-draco-loader: unexpected Draco geometry type");
  }

  if (!status.ok() || dracoGeometry.ptr === 0) {
    const errorMessage = status.error_msg();
    draco.destroy(dracoGeometry);
    throw new Error(`node-draco-loader: Draco decode failed: ${errorMessage}`);
  }

  try {
    const geometry = new BufferGeometry();
    for (const [attributeName, attributeIdOrSemantic] of Object.entries(attributeIds)) {
      const attributeId = getAttributeId(
        draco,
        decoder,
        dracoGeometry,
        attributeIdOrSemantic,
        useUniqueIds,
      );

      if (!Number.isFinite(attributeId) || attributeId < 0) {
        continue;
      }

      const attribute = useUniqueIds
        ? decoder.GetAttributeByUniqueId(dracoGeometry, attributeId)
        : decoder.GetAttribute(dracoGeometry, attributeId);
      const attributeType = resolveAttributeArrayConstructor(attributeTypes[attributeName]);
      geometry.setAttribute(
        attributeName,
        decodeVertexAttribute(
          draco,
          decoder,
          dracoGeometry,
          attributeName,
          attributeType,
          attribute,
        ),
      );
    }

    if (geometryType === draco.TRIANGULAR_MESH) {
      geometry.setIndex(decodeTriangleIndex(draco, decoder, dracoGeometry as DracoMesh));
    }

    return geometry;
  } finally {
    draco.destroy(dracoGeometry);
  }
}

async function decodeDracoBuffer(
  buffer: ArrayBuffer,
  attributeIds: DracoAttributeIds,
  attributeTypes: DracoAttributeTypes,
  useUniqueIds: boolean,
): Promise<BufferGeometry> {
  const draco = await getDecoderModule();
  const decoder = new draco.Decoder();
  const decoderBuffer = new draco.DecoderBuffer();
  decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);

  try {
    return buildGeometryFromDracoBuffer(
      draco,
      decoder,
      decoderBuffer,
      attributeIds,
      attributeTypes,
      useUniqueIds,
    );
  } finally {
    draco.destroy(decoderBuffer);
    draco.destroy(decoder);
  }
}

class NodeDracoDecoder implements GltfDracoDecoder {
  preload(): this {
    void getDecoderModule();
    return this;
  }

  dispose(): this {
    return this;
  }

  decodeDracoFile(
    buffer: ArrayBuffer,
    onLoad: (geometry: BufferGeometry) => void,
    attributeIds?: DracoAttributeIds,
    attributeTypes?: DracoAttributeTypes,
    _vertexColorSpace?: unknown,
    onError: (error: unknown) => void = () => undefined,
  ): void {
    void decodeDracoBuffer(
      buffer,
      attributeIds ?? DEFAULT_DRACO_ATTRIBUTE_IDS,
      attributeTypes ?? DEFAULT_DRACO_ATTRIBUTE_TYPES,
      attributeIds !== undefined,
    )
      .then(onLoad)
      .catch(onError);
  }
}

export function createNodeDracoDecoder(): GltfDracoDecoder {
  return new NodeDracoDecoder();
}
