export const streamedContent = String.raw`
<h1>Streamed Title</h1>
<p>This is the first paragraph of a longer streamed HTML text.  It demonstrates how to include various HTML elements and format code examples.</p>
<h2>Code Examples</h2>
<p>Here's a JavaScript code example:</p>
<pre><code class="language-javascript">
// Function to calculate the factorial of a number
function factorial(n) {
  if (n === 0) {
    return 1;
  }
  return n * factorial(n - 1);
}

// Calculate the factorial of 5
const result = factorial(5);
console.log(result); // Output: 120
</code></pre>
<p>And here's a Python code example:</p>
<pre><code class="language-python">
# Function to calculate the Fibonacci sequence up to n terms
def fibonacci(n):
    a, b = 0, 1
    if n <= 0:
        return []
    elif n == 1:
        return [a]
    else:
        list_fib = [a, b]
        while len(list_fib) < n:
            c = a + b
            a, b = b, c
            list_fib.append(c)
        return list_fib

# Generate the Fibonacci sequence up to 10 terms
result = fibonacci(10)
print(result) # Output: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
</code></pre>
<h3>More Text</h3>
<p>This is some additional text to make the content longer.  You can continue adding more paragraphs, headings, lists, and other HTML elements as needed.</p>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
  <li>Item 3</li>
</ul>
<p>Remember to style the code blocks appropriately using CSS.  For example, you might use a library like Prism.js or highlight.js for syntax highlighting.</p>
<pre><code class="language-html">
&lt;!DOCTYPE html&gt;
&lt;html&gt;
&lt;head&gt;
  &lt;title&gt;Example HTML&lt;/title&gt;
&lt;/head&gt;
&lt;body&gt;
  &lt;p&gt;This is an example of HTML code.&lt;/p&gt;
&lt;/body&gt;
&lt;/html&gt;
</code></pre>

<h1>Math expressions</h1>
<h6>Inline</h6>

<p>
<span data-type="inline-math" data-latex="\alpha"></span>
<span data-type="inline-math" data-latex="\beta"></span>
<span data-type="inline-math" data-latex="\pi"></span>
<span data-type="inline-math" data-latex="x^2 + y^2 = z^2"></span>
<span data-type="inline-math" data-latex="E = mc^2"></span>
<span data-type="inline-math" data-latex="\frac{1}{2}"></span>
<span data-type="inline-math" data-latex="\sqrt{2}"></span>
<span data-type="inline-math" data-latex="\sum_{i=1}^{n} i"></span>
<span data-type="inline-math" data-latex="\int_0^1 x^2 dx"></span>
</p>

<h6>Block</h6>

<div data-type="block-math" data-latex="\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}"></div>

<div data-type="block-math" data-latex="\int_{a}^{b} f(x) \, dx = F(b) - F(a)"></div>

<div data-type="block-math" data-latex="\lim_{x \to 0} \frac{\sin x}{x} = 1"></div>

<div data-type="block-math" data-latex="\left( \frac{a+b}{c+d} \right)^2"></div>

<div data-type="block-math" data-latex="\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}"></div>

<h6>Complex inline math</h6>
<p>
<span data-type="inline-math" data-latex="\left( \frac{a}{b} \right)"></span>
<span data-type="inline-math" data-latex="\left| x \right|"></span>
<span data-type="inline-math" data-latex="\left\{ x \in \mathbb{R} \mid x > 0 \right\}"></span>
<span data-type="inline-math" data-latex="\binom{n}{k}"></span>
<span data-type="inline-math" data-latex="\vec{v} = (v_x, v_y, v_z)"></span>
</p>

<h6>Misc math</h6>
<p>
<span data-type="inline-math" data-latex="A \cup B"></span>
<span data-type="inline-math" data-latex="A \cap B"></span>
<span data-type="inline-math" data-latex="A \subseteq B"></span>
<span data-type="inline-math" data-latex="\forall x \in \mathbb{R},\ x^2 \geq 0"></span>
<span data-type="inline-math" data-latex="\exists x \in \mathbb{Z},\ x^2 = 2"></span>
<span data-type="inline-math" data-latex="\theta"></span>
<span data-type="inline-math" data-latex="\lambda"></span>
<span data-type="inline-math" data-latex="\mu"></span>
<span data-type="inline-math" data-latex="\sigma"></span>
<span data-type="inline-math" data-latex="\omega"></span>
<span data-type="inline-math" data-latex="\infty"></span>
<span data-type="inline-math" data-latex="\approx"></span>
<span data-type="inline-math" data-latex="\neq"></span>
<span data-type="inline-math" data-latex="\leq"></span>
<span data-type="inline-math" data-latex="\geq"></span>
<span data-type="inline-math" data-latex="\Rightarrow"></span>
</p>
`;
