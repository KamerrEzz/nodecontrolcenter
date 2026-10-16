//! TCP/UDP socket enumeration through the OS tables (GetExtendedTcpTable /
//! GetExtendedUdpTable via netstat2). A single consistent snapshot per call —
//! we never parse the output of the netstat command line.

use std::collections::HashMap;
use std::net::IpAddr;

use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, TcpState};

use crate::model::SocketEntry;

fn ip_to_string(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(_) => ip.to_string(),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                v4.to_string()
            } else {
                v6.to_string()
            }
        }
    }
}

/// Snapshot of every TCP and UDP socket the system reports, with owner PIDs.
pub fn get_socket_entries() -> Result<Vec<SocketEntry>, String> {
    let sockets = get_sockets_info(AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6, ProtocolFlags::TCP | ProtocolFlags::UDP)
        .map_err(|e| format!("socket table query failed: {e}"))?;

    let mut entries: Vec<SocketEntry> = Vec::new();
    for si in sockets {
        let (protocol, port, state) = match &si.protocol_socket_info {
            ProtocolSocketInfo::Tcp(t) => ("tcp", t.local_port, t.state.to_string().to_lowercase()),
            ProtocolSocketInfo::Udp(u) => ("udp", u.local_port, "udp".to_string()),
        };
        entries.push(SocketEntry {
            protocol: protocol.into(),
            local_addr: ip_to_string(si.local_addr()),
            port,
            state,
            pids: si.associated_pids.clone(),
            process_names: Vec::new(),
            node_related: false,
        });
    }
    // Most useful ordering: port number, then protocol.
    entries.sort_by_key(|e| (e.port, e.protocol.clone()));
    Ok(entries)
}

/// Annotate socket entries with process names / Node-relevance.
pub fn annotate_sockets(entries: &mut [SocketEntry], names: &HashMap<u32, String>, node_pids: &std::collections::HashSet<u32>) {
    for e in entries {
        e.process_names = e.pids.iter().filter_map(|p| names.get(p).cloned()).collect();
        e.node_related = e.pids.iter().any(|p| node_pids.contains(p));
    }
}

/// Is `port` being listened on by any TCP socket in this snapshot?
/// States are stored lowercase (normalized in `get_socket_entries`).
pub fn find_tcp_listener(entries: &[SocketEntry], port: u16) -> Option<SocketEntry> {
    entries
        .iter()
        .find(|e| e.protocol == "tcp" && e.port == port && e.state == "listen")
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(protocol: &str, port: u16, state: &str, pids: Vec<u32>) -> SocketEntry {
        SocketEntry {
            protocol: protocol.into(),
            local_addr: "0.0.0.0".into(),
            port,
            state: state.into(),
            pids,
            process_names: Vec::new(),
            node_related: false,
        }
    }

    #[test]
    fn finds_tcp_listener_only() {
        let entries = vec![
            entry("udp", 5353, "udp", vec![]),
            entry("tcp", 8080, "established", vec![4]),
            entry("tcp", 8080, "listen", vec![4]),
        ];
        let found = find_tcp_listener(&entries, 8080).expect("should find listener");
        assert_eq!(found.state, "listen");
        assert_eq!(found.pids, vec![4]);
    }

    #[test]
    fn free_port_returns_none() {
        let entries = vec![entry("tcp", 8080, "established", vec![4])];
        assert!(find_tcp_listener(&entries, 3000).is_none());
    }

    #[test]
    fn annotate_marks_node_relevance() {
        let mut entries = vec![entry("tcp", 3000, "listen", vec![1, 2])];
        let mut names = HashMap::new();
        names.insert(1, "node.exe".to_string());
        names.insert(2, "npm.cmd".to_string());
        let mut node_pids = std::collections::HashSet::new();
        node_pids.insert(1);
        annotate_sockets(&mut entries, &names, &node_pids);
        assert!(entries[0].node_related);
        assert_eq!(entries[0].process_names, vec!["node.exe", "npm.cmd"]);
    }
}
