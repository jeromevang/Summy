/**
 * TestWidget
 * A sample Mendix pluggable widget
 */

import { ReactElement, createElement, useState, useEffect } from "react";
import { TestWidgetContainerProps } from "../typings/TestWidgetProps";

export function TestWidget(props: TestWidgetContainerProps): ReactElement {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (props.dataSource && props.dataSource.status === "available") {
            loadData();
        }
    }, [props.dataSource?.status]);

    const loadData = async () => {
        try {
            setLoading(true);
            
            if (props.dataSource?.items) {
                const items = props.dataSource.items.map(item => ({
                    id: item.id,
                    displayValue: props.displayAttribute?.get(item)?.value || "N/A"
                }));
                setData(items);
            }
        } catch (err: any) {
            setError(err.message || "Failed to load data");
        } finally {
            setLoading(false);
        }
    };

    const handleItemClick = (item: any) => {
        if (props.onClickAction) {
            props.onClickAction.execute();
        }
    };

    if (loading) {
        return <div className="test-widget loading">Loading...</div>;
    }

    if (error) {
        return <div className="test-widget error">{error}</div>;
    }

    return (
        <div className={`test-widget ${props.class}`} style={props.style}>
            <h3>{props.title || "Test Widget"}</h3>
            
            <ul className="widget-list">
                {data.map(item => (
                    <li 
                        key={item.id}
                        className="widget-item"
                        onClick={() => handleItemClick(item)}
                    >
                        {item.displayValue}
                    </li>
                ))}
            </ul>
            
            {data.length === 0 && (
                <p className="empty-state">No items to display</p>
            )}
        </div>
    );
}

export default TestWidget;

