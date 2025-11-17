#!/bin/bash
set -e

echo "=========================================="
echo "🚀 EC2 Instance Setup for Pardon Simulator"
echo "=========================================="
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
else
  OS="unknown"
fi

echo "Detected OS: $OS"
echo ""

# Update system
echo "📦 Updating system packages..."
if [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ] || [ "$OS" = "centos" ]; then
  sudo yum update -y
elif [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
  sudo apt-get update -y
  sudo apt-get upgrade -y
fi
echo "✓ System updated"
echo ""

# Install Docker
echo "🐳 Installing Docker..."
if [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ] || [ "$OS" = "centos" ]; then
  sudo yum install -y docker
  sudo systemctl start docker
  sudo systemctl enable docker
  sudo usermod -aG docker ec2-user
elif [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
  sudo apt-get install -y docker.io
  sudo systemctl start docker
  sudo systemctl enable docker
  sudo usermod -aG docker ubuntu
fi
echo "✓ Docker installed"
echo ""

# Install Docker Compose
echo "🔧 Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
echo "✓ Docker Compose installed"
echo ""

# Install Git
echo "📚 Installing Git..."
if [ "$OS" = "amzn" ] || [ "$OS" = "rhel" ] || [ "$OS" = "centos" ]; then
  sudo yum install -y git
elif [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
  sudo apt-get install -y git
fi
git --version
echo "✓ Git installed"
echo ""

# Create app directory
echo "📁 Creating application directory..."
mkdir -p ~/pardon-simulator
echo "✓ Directory created: ~/pardon-simulator"
echo ""

echo "=========================================="
echo "✅ EC2 Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Configure AWS credentials (for SSM access):"
echo "   aws configure"
echo ""
echo "2. Clone your repository:"
echo "   cd ~/pardon-simulator"
echo "   git clone https://github.com/YOUR_USERNAME/pardon-simulator.git ."
echo ""
echo "3. Create .env.production file:"
echo "   nano .env.production"
echo "   # Add your secrets (see .env.production.example)"
echo ""
echo "4. Upload configs to SSM:"
echo "   ./scripts/upload-configs.sh"
echo ""
echo "5. Start services:"
echo "   docker-compose up -d"
echo ""
echo "6. View logs:"
echo "   docker-compose logs -f"
echo ""
echo "⚠️  IMPORTANT: You may need to log out and back in for Docker permissions to take effect!"
echo "   Run: exit"
echo "   Then: ssh back in"

