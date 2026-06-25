import Foundation

/// What Samantha remembers about you between sessions: a short relationship
/// summary plus durable facts. This is what makes her feel like she *knows* you
/// rather than meeting you fresh every launch.
struct CompanionMemory: Codable, Equatable {
    /// 1–2 sentence summary of the bond / shared history.
    var relationship: String
    /// Durable facts about the user (name, likes, ongoing topics, life details).
    var facts: [String]
    var updatedAt: Date

    static let empty = CompanionMemory(relationship: "", facts: [], updatedAt: .distantPast)

    var isEmpty: Bool { relationship.isEmpty && facts.isEmpty }
}

/// Persists `CompanionMemory` to a JSON file in the app's Documents directory.
/// Distillation (deciding *what* to remember) is done by the model and lives in
/// `SamanthaEngine`; this type only loads and saves.
final class MemoryStore {
    private let url: URL

    init(filename: String = "samantha_memory.json") {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        self.url = docs.appendingPathComponent(filename)
    }

    func load() -> CompanionMemory {
        guard let data = try? Data(contentsOf: url),
              let memory = try? JSONDecoder().decode(CompanionMemory.self, from: data)
        else { return .empty }
        return memory
    }

    func save(_ memory: CompanionMemory) {
        guard let data = try? JSONEncoder().encode(memory) else { return }
        try? data.write(to: url, options: [.atomic])
    }

    func reset() {
        try? FileManager.default.removeItem(at: url)
    }
}
