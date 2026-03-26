# Tries — Prefix Trees

## What Is a Trie?

A **trie** (pronounced "try") is a tree-like data structure used to store a dynamic set of strings. Each node represents a single character, and paths from root to marked nodes spell out words in the collection.

```
             (root)
            / |  \
           a  b   c
          /   |    \
         p    a     a
        / \   |      \
       p   r  t       r
      /     \          \
     l       t          s
     e
```

> **Key Insight:** Tries share common prefixes. The words "app", "apple", "art" share the prefix "a", and "app"/"apple" share "app". This makes prefix-based lookups extremely fast.

---

## Trie Node Structure

```csharp
public class TrieNode
{
    // Map each character to its child node
    public Dictionary<char, TrieNode> Children { get; } = new();

    // Marks whether this node is the end of a valid word
    public bool IsEndOfWord { get; set; }
}
```

## Full Trie Implementation

```csharp
public class Trie
{
    private readonly TrieNode _root = new();

    // Insert a word into the trie — O(m) where m = word length
    public void Insert(string word)
    {
        var current = _root;
        foreach (char ch in word)
        {
            if (!current.Children.ContainsKey(ch))
                current.Children[ch] = new TrieNode();
            current = current.Children[ch];
        }
        current.IsEndOfWord = true;
    }

    // Search for an exact word — O(m)
    public bool Search(string word)
    {
        var node = FindNode(word);
        return node is not null && node.IsEndOfWord;
    }

    // Check if any word starts with the given prefix — O(m)
    public bool StartsWith(string prefix)
    {
        return FindNode(prefix) is not null;
    }

    // Helper: traverse trie following the characters in s
    private TrieNode? FindNode(string s)
    {
        var current = _root;
        foreach (char ch in s)
        {
            if (!current.Children.TryGetValue(ch, out var next))
                return null;
            current = next;
        }
        return current;
    }
}
```

### Insertion Diagram — Inserting "cat", "car", "card"

```
Insert "cat":          Insert "car":          Insert "card":

  (root)                 (root)                 (root)
    |                      |                      |
    c                      c                      c
    |                      |                      |
    a                      a                      a
    |                    /   \                  /   \
    t*                  t*    r*               t*    r*
                                                    |
                                                    d*

(* = IsEndOfWord = true)
```

---

## Complexity Analysis

| Operation   | Time   | Space                  |
|-------------|--------|------------------------|
| Insert      | O(m)   | O(m) worst case        |
| Search      | O(m)   | O(1)                   |
| StartsWith  | O(m)   | O(1)                   |
| Delete      | O(m)   | O(1)                   |
| **Space (whole trie)** | — | O(N * m * C) where N=words, m=avg length, C=char size |

> `m` is the length of the word/prefix being operated on.

---

## Use Cases

- **Autocomplete** — find all words with a given prefix
- **Spell checking** — quickly verify if a word exists
- **IP routing** — longest prefix matching
- **Word games** — validate words and prune search space
- **DNA sequence matching** — store and query genomic data

---

## Practice Problems

### Problem 1: Implement Trie (LeetCode 208)

**Problem:** Implement a trie with `Insert`, `Search`, and `StartsWith` methods.

**Approach:** Use a dictionary-based node structure. Each operation walks the trie character by character.

```csharp
public class Trie
{
    private readonly TrieNode _root = new();

    public void Insert(string word)
    {
        var node = _root;
        foreach (char c in word)
        {
            if (!node.Children.ContainsKey(c))
                node.Children[c] = new TrieNode();
            node = node.Children[c];
        }
        node.IsEndOfWord = true;
    }

    public bool Search(string word)
    {
        var node = Traverse(word);
        return node is not null && node.IsEndOfWord;
    }

    public bool StartsWith(string prefix)
    {
        return Traverse(prefix) is not null;
    }

    private TrieNode? Traverse(string s)
    {
        var node = _root;
        foreach (char c in s)
        {
            if (!node.Children.TryGetValue(c, out var child))
                return null;
            node = child;
        }
        return node;
    }
}
```

**Complexity:** O(m) time for each operation, O(m) space per insertion.

---

### Problem 2: Word Search II (LeetCode 212)

**Problem:** Given a 2D board of characters and a list of words, find all words that can be formed by sequentially adjacent cells (horizontal/vertical). Each cell may only be used once per word.

**Approach:** Build a trie from the word list, then DFS from every cell. The trie lets us prune branches that cannot lead to any word.

```csharp
public class Solution
{
    private int _rows, _cols;
    private char[][] _board;
    private readonly int[][] _dirs = { new[]{0,1}, new[]{0,-1}, new[]{1,0}, new[]{-1,0} };

    public IList<string> FindWords(char[][] board, string[] words)
    {
        _board = board;
        _rows = board.Length;
        _cols = board[0].Length;

        // Build trie from word list
        var root = new TrieNode();
        foreach (string w in words)
        {
            var node = root;
            foreach (char c in w)
            {
                if (!node.Children.ContainsKey(c))
                    node.Children[c] = new TrieNode();
                node = node.Children[c];
            }
            node.Word = w; // store full word at terminal node
        }

        var result = new List<string>();

        // DFS from every cell
        for (int r = 0; r < _rows; r++)
            for (int c = 0; c < _cols; c++)
                if (root.Children.ContainsKey(board[r][c]))
                    Dfs(r, c, root, result);

        return result;
    }

    private void Dfs(int r, int c, TrieNode parent, IList<string> result)
    {
        char ch = _board[r][c];
        var node = parent.Children[ch];

        // Found a word — add it and clear to avoid duplicates
        if (node.Word is not null)
        {
            result.Add(node.Word);
            node.Word = null;
        }

        _board[r][c] = '#'; // mark visited

        foreach (var d in _dirs)
        {
            int nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < _rows && nc >= 0 && nc < _cols
                && _board[nr][nc] != '#'
                && node.Children.ContainsKey(_board[nr][nc]))
            {
                Dfs(nr, nc, node, result);
            }
        }

        _board[r][c] = ch; // restore

        // Prune: if node has no children left, remove from parent
        if (node.Children.Count == 0)
            parent.Children.Remove(ch);
    }
}

public class TrieNode
{
    public Dictionary<char, TrieNode> Children { get; } = new();
    public string? Word { get; set; } // non-null if this node ends a word
}
```

**Complexity:** O(rows * cols * 4^L) time where L is max word length; O(N * L) space for the trie.

---

### Problem 3: Add and Search Words — Wildcard Search (LeetCode 211)

**Problem:** Design a data structure that supports adding words and searching with `.` as a wildcard that matches any single character.

**Approach:** Use a trie for storage. On search, when encountering `.`, branch into all children recursively.

```csharp
public class WordDictionary
{
    private readonly TrieNode _root = new();

    public void AddWord(string word)
    {
        var node = _root;
        foreach (char c in word)
        {
            if (!node.Children.ContainsKey(c))
                node.Children[c] = new TrieNode();
            node = node.Children[c];
        }
        node.IsEndOfWord = true;
    }

    public bool Search(string word)
    {
        return SearchHelper(_root, word, 0);
    }

    private bool SearchHelper(TrieNode node, string word, int index)
    {
        if (index == word.Length)
            return node.IsEndOfWord;

        char c = word[index];

        if (c == '.')
        {
            // Wildcard: try every child
            foreach (var child in node.Children.Values)
            {
                if (SearchHelper(child, word, index + 1))
                    return true;
            }
            return false;
        }
        else
        {
            if (!node.Children.TryGetValue(c, out var child))
                return false;
            return SearchHelper(child, word, index + 1);
        }
    }
}
```

**Complexity:** AddWord is O(m). Search is O(m) without wildcards, O(26^d * m) worst case with d wildcards. Space: O(total characters across all words).

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting `IsEndOfWord` flag | "app" is not found if only "apple" was inserted — always mark terminals |
| Not pruning in Word Search II | Without pruning, TLE on large inputs — remove childless nodes after DFS |
| Using array `new TrieNode[26]` for only lowercase | Works but wastes memory if charset is large; use `Dictionary` for flexibility |
| Modifying the board without restoring | Always restore the cell after DFS backtracking |

---

## Interview Tips

- Mention that tries trade space for speed — they can use a lot of memory.
- Know both `Dictionary<char, TrieNode>` (flexible) and `TrieNode[26]` (faster for lowercase-only).
- For autocomplete, explain how you'd collect all words under a prefix node using DFS/BFS.
- Trie + DFS is a classic combination for grid/word problems — practice it.
- Compressed tries (radix trees) store multiple characters per edge to save space.

---

## Quiz

<details>
<summary>1. What is the time complexity of searching for a word of length m in a trie?</summary>

**O(m)** — you traverse exactly m nodes regardless of how many words are stored.
</details>

<details>
<summary>2. Why is a trie better than a HashSet for prefix queries?</summary>

A HashSet can check if a full word exists in O(1), but it cannot efficiently answer "are there any words starting with X?" without scanning all entries. A trie answers prefix queries in O(prefix length).
</details>

<details>
<summary>3. What is the worst-case space complexity of a trie storing N words of average length m over an alphabet of size C?</summary>

**O(N * m * C)** — each of the N*m nodes could have up to C child pointers (when using array-based nodes). With dictionary-based nodes, actual space depends on the number of unique prefixes.
</details>

<details>
<summary>4. In Word Search II, why do we prune trie nodes after DFS?</summary>

Pruning removes branches that have already yielded all their words. This prevents redundant traversals and is critical for passing time limits on large inputs.
</details>

<details>
<summary>5. How would you modify a trie to support case-insensitive search?</summary>

Convert all characters to lowercase (or uppercase) before inserting and searching: `char c = char.ToLower(ch);`. This ensures "Apple" and "apple" map to the same path.
</details>
