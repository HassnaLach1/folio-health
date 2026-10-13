import React from 'react';
import { MedicalDocument } from './domain';

declare const DocumentViewer: React.ComponentType<{ document: MedicalDocument; page?: number }>;
export default DocumentViewer;
