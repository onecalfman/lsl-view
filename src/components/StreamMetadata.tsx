import { useState } from "react";
import type { LslStream } from "../lib/types";
import { formatChannelFormat, formatSampleRate } from "../lib/utils";

interface StreamMetadataProps {
  stream: LslStream;
}

export function StreamMetadata({ stream }: StreamMetadataProps) {
  const [showXml, setShowXml] = useState(false);

  return (
    <div className="stream-metadata">
      <h3>Stream Info</h3>
      <table className="meta-table">
        <tbody>
          <tr>
            <td className="meta-key">Name</td>
            <td>{stream.name}</td>
          </tr>
          <tr>
            <td className="meta-key">Type</td>
            <td>{stream.type}</td>
          </tr>
          <tr>
            <td className="meta-key">Channels</td>
            <td>{stream.channelCount}</td>
          </tr>
          <tr>
            <td className="meta-key">Sample Rate</td>
            <td>{formatSampleRate(stream.nominalSrate)}</td>
          </tr>
          <tr>
            <td className="meta-key">Format</td>
            <td>{formatChannelFormat(stream.channelFormat)}</td>
          </tr>
          <tr>
            <td className="meta-key">Source ID</td>
            <td className="mono">{stream.sourceId || "—"}</td>
          </tr>
          <tr>
            <td className="meta-key">Hostname</td>
            <td>{stream.hostname}</td>
          </tr>
          <tr>
            <td className="meta-key">UID</td>
            <td className="mono uid-cell">{stream.uid}</td>
          </tr>
        </tbody>
      </table>

      {stream.channelNames.length > 0 && (
        <div className="channel-list">
          <h4>Channels</h4>
          <div className="channel-tags">
            {stream.channelNames.map((name, i) => (
              <span key={i} className="channel-tag">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <button className="btn-sm" onClick={() => setShowXml(!showXml)}>
        {showXml ? "Hide" : "Show"} Raw XML
      </button>

      {showXml && (
        <pre className="xml-block">{formatXml(stream.xmlDesc)}</pre>
      )}
    </div>
  );
}

/** Simple XML pretty-printer. */
function formatXml(xml: string): string {
  try {
    let formatted = "";
    let indent = 0;
    const parts = xml.replace(/>\s*</g, "><").split(/(<[^>]+>)/);
    for (const part of parts) {
      if (!part.trim()) continue;
      if (part.startsWith("</")) {
        indent = Math.max(0, indent - 1);
        formatted += "  ".repeat(indent) + part + "\n";
      } else if (part.startsWith("<") && !part.startsWith("<?") && !part.endsWith("/>")) {
        formatted += "  ".repeat(indent) + part + "\n";
        if (!part.includes("</")) indent++;
      } else {
        formatted += "  ".repeat(indent) + part + "\n";
      }
    }
    return formatted.trim();
  } catch {
    return xml;
  }
}
