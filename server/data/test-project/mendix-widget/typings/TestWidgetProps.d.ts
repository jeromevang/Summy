/**
 * TestWidget Properties
 * Type definitions for the Mendix pluggable widget
 */

import { CSSProperties } from "react";
import { ActionValue, ListValue, ListAttributeValue } from "mendix";

export interface TestWidgetContainerProps {
    name: string;
    class: string;
    style?: CSSProperties;
    tabIndex?: number;
    
    // Data properties
    title?: string;
    dataSource?: ListValue;
    displayAttribute?: ListAttributeValue<string>;
    
    // Actions
    onClickAction?: ActionValue;
    onLoadAction?: ActionValue;
    
    // Appearance
    showHeader?: boolean;
    emptyMessage?: string;
}

export interface TestWidgetPreviewProps {
    className: string;
    style: string;
    styleObject?: CSSProperties;
    readOnly: boolean;
    
    title?: string;
    showHeader?: boolean;
    emptyMessage?: string;
}

