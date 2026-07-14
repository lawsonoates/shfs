export type {
	ByteRecord,
	FileRecord,
	JsonRecord,
	LineRecord,
	StdoutRecord as Record,
} from './stdout-record';
export {
	byteRecordToLineRecords,
	formatStdoutRecord as formatRecord,
	formatStdoutRecords as formatRecords,
	recordsToBytes,
} from './stdout-record';
