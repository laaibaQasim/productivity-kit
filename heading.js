const variants = {
  h1: { tag: 'h1', size: '2xl', weight: 'bold' },
  h2: { tag: 'h2', size: 'xl', weight: '600' },
  h3: { tag: 'h3', size: 'lg', weight: '600' }
};

function Heading({ variant = 'h1', children, className }) {
  const config = variants[variant];
  return `<${config.tag} class="text-${config.size} font-${config.weight} ${className || ''}">${children}</${config.tag}>`;
}

module.exports = Heading;
